# Templates de Projeto + cargo Gestor de Projetos

**Data:** 2026-06-20
**Status:** Aprovado (design), aguardando plano de implementação

## Contexto e objetivo

Hoje só o admin cria projetos, e as tarefas são criadas uma a uma. Queremos:

1. **Templates de projeto** — conjuntos reutilizáveis de tarefas que, ao criar um
   projeto, geram as tarefas automaticamente.
2. **Novo cargo "Gestor de Projetos"** — papel global que, junto com o admin,
   faz a gestão de projetos e templates.
3. **Remover o conceito de "líder de projeto"** — papel por-projeto que hoje só
   libera 2 ações destrutivas; será absorvido pelo cargo global.

## Decisões tomadas (brainstorming)

- Template é aplicado **na criação do projeto** (não em projeto existente).
- Cada item de template carrega **título, descrição e prioridade**. Nasce na
  coluna "A fazer", sem responsável e sem prazo.
- **Admin e Gestor de Projetos** criam/editam projetos e templates e aplicam
  template. **Excluir/restaurar projeto continua só admin.**
- O "líder de projeto" é **removido por completo** (opção global): os poderes
  destrutivos de tarefa passam a ser de admin + Gestor de Projetos, em qualquer
  projeto.
- Tela de gestão de templates fica **dentro da aba Projetos**.
- O editor de template **salva a lista inteira de itens de uma vez** (não item a item).

## 1. Novo cargo: Gestor de Projetos

- Novo valor no enum `user_role`: `project_manager`.
  - Migration própria com `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_manager';`.
    No Postgres 16 isso roda dentro da transação do runner desde que o novo valor
    **não seja usado na mesma migration** (e não é — só adicionamos). Não muda o default.
- Rótulo na UI: **"Gestor de Projetos"** (`roleLabel` em `web/src/lib/permissions.js`
  e no backend `src/lib/permissions.js`).
- Atribuído na tela de Equipe (`AdminTeamPage`), junto dos papéis existentes.
- Helper de permissão novo em ambos os `permissions.js`:
  - `isProjectManagerRole(role)` / `isProjectManager(profile)`
  - `canManageProjects(profile) = isAdmin || isProjectManager`

## 2. Remoção do "líder de projeto"

Estado atual: tabela `project_leaders`, componente `LeaderManager`, endpoint
`GET /me/leadership`, rotas `GET/POST/DELETE /projects/:id/leaders`, helpers
`isProjectLeader` e `canManageTasks` (que consulta o banco).

Mudanças:

- **Migration:** `DROP TABLE IF EXISTS project_leaders CASCADE;`
- **Backend (`projectManagement.js`):**
  - Remover `isProjectLeader`, `GET /me/leadership`, `GET/POST/DELETE /projects/:id/leaders`.
  - `canManageTasks(profile)` deixa de receber/consultar `projectId`: passa a ser
    `isAdmin(profile) || isProjectManager(profile)`.
  - Ajustar o `export { isProjectLeader, canManageTasks }` (remover `isProjectLeader`).
- **Backend (`taskCollaboration.js`):** na exclusão de anexo, trocar a checagem
  `... || isProjectLeader(...)` por `... || isProjectManager(req.profile)`.
- **Frontend (`ProjectBoardPage.jsx`):**
  - Remover `leaderProjectIds`, `loadLeadership`, chamadas a `/me/leadership` e o
    `<LeaderManager>`.
  - `canManageProject(projectId)` → `canManageProjects` (admin || gestor), sem projectId.
  - O `canManage` passado ao `TaskDetailModal` passa a refletir admin || gestor.
- **Remover arquivo** `web/src/pages/projectBoard/LeaderManager.jsx`.

## 3. Templates — modelo de dados

Migration nova cria:

```sql
CREATE TABLE project_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  priority    task_priority NOT NULL DEFAULT 'medium',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_template_items_template_idx ON project_template_items(template_id);
```

Trigger `set_updated_at` em `project_templates` (mesmo padrão das outras tabelas).

## 4. Backend — rotas de templates

Arquivo novo `src/routes/projectTemplates.js` (montado no server como os demais).
Guard: `requireAuth` + `requireProjectManagement` (admin || project_manager) — novo
middleware análogo a `requireOperationalAccess`.

- `GET  /project-templates` — lista (id, name, description, item_count).
- `GET  /project-templates/:id` — template + itens (ordenados por position).
- `POST /project-templates` — body `{ name, description?, items: [{title, description?, priority?}] }`.
  Cria template e itens (position pela ordem do array) numa transação.
- `PUT  /project-templates/:id` — body `{ name, description?, items: [...] }`.
  Atualiza nome/descrição e **substitui todos os itens** (delete + insert) em transação.
- `DELETE /project-templates/:id` — remove template (itens caem por cascade).

Validação: `name` obrigatório; `priority` em `low|medium|high` (default `medium`);
`title` de cada item obrigatório.

## 5. Backend — aplicar template na criação do projeto

`POST /projects` (em `src/routes/projects.js`):

- Permissão: trocar `requireAdmin` por `requireProjectManagement` (admin || gestor).
  (Idem `PUT /projects/:id` e `POST /projects/:id/image`. `DELETE`/`restore`/
  `GET /projects/deleted` continuam `requireAdmin`.)
- Aceita `template_id` opcional no body.
- Fluxo (transação única):
  1. Insere o projeto (como hoje: name, client_id, address, start_date, status active).
  2. Se `template_id` veio: valida que existe; lê os itens ordenados por position;
     insere uma `tasks` por item com `project_id`, `title`, `description`,
     `priority`, `status = 'todo'`, `position` sequencial (0..n), `created_by = req.profile.id`.
  3. Se qualquer passo falhar, rollback (não cria projeto pela metade).
- Sem responsável e sem due_date nas tasks geradas.

## 6. Permissões (resumo final)

| Ação | Admin | Gestor de Projetos | Outros logados |
|---|---|---|---|
| Criar/editar projeto + imagem | ✅ | ✅ | ❌ |
| Excluir/restaurar projeto | ✅ | ❌ | ❌ |
| Criar/editar/excluir template | ✅ | ✅ | ❌ |
| Aplicar template na criação | ✅ | ✅ | ❌ |
| Hard-delete de tarefa | ✅ | ✅ | ❌ |
| Remover qualquer anexo de tarefa | ✅ | ✅ | ❌ (só o autor do anexo) |
| Criar/editar/mover tarefa, comentar, anexar, abandonar/reabrir | ✅ | ✅ | ✅ |

Backend valida em todas as rotas; a UI apenas espelha.

## 7. Frontend — UI

**Aba Projetos (`ProjectBoardPage.jsx`)**
- `canManageProjects` passa a ser `isAdmin || isProjectManager` (de `useAuth`).
- Botão **"Templates"** no header do catálogo (ao lado de "Novo Projeto"/"Excluídos"),
  visível para admin || gestor. Abre a gestão de templates (ver abaixo).
- Form **Novo Projeto**: campo **"Template"** (Select opcional: "Nenhum" + lista de
  templates carregada de `/project-templates`). Ao criar, envia `template_id`.

**Gestão de templates** (um terceiro "nível" da página Projetos, por estado —
como hoje existe catálogo ↔ board; não é uma rota nova)
- Lista de templates (nome, nº de tasks) com ações criar/editar/excluir.
- Editor de template: nome, descrição, e uma lista de itens (task) — adicionar,
  remover, reordenar; cada item com título, descrição e prioridade. Botão Salvar
  envia o conjunto inteiro (`PUT`/`POST` com `items`).

**AuthContext** — expor `isProjectManager` e `canManageProjects`.

**Equipe (`AdminTeamPage`)** — incluir "Gestor de Projetos" nas opções de cargo.

## 8. Itens fora de escopo (YAGNI)

- Aplicar template em projeto já existente.
- Responsável/prazo por item de template.
- Coluna inicial configurável por item (tudo nasce em "A fazer").
- Versionamento/histórico de templates.

## 9. Verificação

- Migrations aplicam limpo (`npm run migrate`) e colunas/tabelas conferidas no banco.
- `node --check` nas rotas alteradas; `vite build` no front.
- Teste manual: criar template com N itens; criar projeto com esse template e
  confirmar N tasks em "A fazer"; confirmar que gestor consegue e colaborador não;
  confirmar que hard-delete de tarefa funciona para gestor e some o LeaderManager.
