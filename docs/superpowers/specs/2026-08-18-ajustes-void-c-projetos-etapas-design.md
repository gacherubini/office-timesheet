# Design — Bloco C: Projetos, etapas e múltiplos clientes (itens 7, 8)

**Data:** 2026-08-18
**Status:** aprovado no brainstorming; a implementar (test-first)
**Origem:** `Gestao-VOID-ajustes-desenvolvimento.pdf`, seção "PROJETOS"
**Bloco:** C da `2026-08-18-ajustes-void-visao-geral.md`

> A estrutura sai de **projeto → tarefas** para **projeto → etapa → tarefa**, e
> o projeto passa a ter mais de um contratante. O PDF chama a camada de etapas
> de "principal ganho do módulo", e a razão é que hoje o quadro mostra tarefas
> soltas e não diz em que ponto o projeto está.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| `tasks.task_type` | Substituído por `stage_id`; coluna removida no fim do bloco | O PDF exige "toda tarefa pertence a uma etapa". Dois campos com o mesmo significado confundem tela e agente |
| Catálogo | **Global e editável pelo admin** | Global preserva a comparação de custo/prazo entre obras (alerta do próprio PDF). Editável destrava a implementação sem esperar o cliente |
| Seed do catálogo | As 10 do PDF **+** todo `task_type` distinto de produção | Nenhuma tarefa fica órfã na migration. Ver §3 |
| Etapa do projeto | Cópia do catálogo, não referência viva | Renomear "Anteprojeto" no catálogo não pode reescrever a história de 40 obras |
| "Falta info" | Novo valor de enum, entre `in_progress` e `in_review` | Mesmo padrão das migrations 015 e 025 |
| Horas por etapa | Derivadas, sem coluna | `task_time_logs` já amarra tempo à tarefa, e a tarefa passa a ter etapa |
| `projects.client_id` | Mantida, sincronizada com o contratante principal | Ver §5 |

---

## 2. Item 7 — mais de um cliente por projeto

### Hoje

`projects.client_id` é FK única (migration 018) e `projects.client` é o nome
denormalizado, mantido para projetos antigos.

### Migration 044

```sql
CREATE TABLE project_clients (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  role       text NOT NULL DEFAULT 'contratante',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, client_id)
);

CREATE UNIQUE INDEX project_clients_um_principal
  ON project_clients(project_id) WHERE is_primary;

CREATE INDEX project_clients_client_idx ON project_clients(client_id);
```

`ON DELETE RESTRICT` no cliente é deliberado: apagar um cliente que é
contratante de uma obra tem que doer. `CASCADE` só no projeto.

Papéis (item 7, a confirmar com o João Pedro): `contratante_principal`,
`contratante`, `investidor`, `representante`.

Backfill:

```sql
INSERT INTO project_clients (project_id, client_id, role, is_primary)
SELECT id, client_id, 'contratante_principal', true
FROM projects WHERE client_id IS NOT NULL;
```

### `projects.client_id` continua existindo

Não é preguiça — é contenção de raio de impacto. `client_id` e o `LEFT JOIN
clients` aparecem em `routes/projects.js` (4 lugares) e na tool
`statusProjeto.js` do agente. Mantê-la **sincronizada com o contratante
principal** deixa todos esses leitores funcionando sem alteração, enquanto as
telas novas leem `project_clients`.

A sincronia é responsabilidade da rota de escrita, dentro da mesma transação que
grava `project_clients` — não de trigger. Trigger que reescreve coluna de outra
tabela é o tipo de mágica que ninguém encontra quando dá errado.

Um teste garante a invariante: **`projects.client_id` é sempre o
`project_clients` com `is_primary`**.

### Contador na ficha da pessoa

O PDF: *"Na ficha da pessoa, o contador de projetos considera todos os papéis."*
Ou seja, `COUNT` sobre `project_clients`, não sobre `projects.client_id` — o
investidor conta.

**Aceite:** *"Cadastro um projeto com dois contratantes; ambos aparecem no
projeto e o projeto aparece na ficha dos dois."*

---

## 3. Item 8 — a camada de etapas

### Duas tabelas, e por que duas

```
  stage_catalog                     project_stages
  (o que o escritório faz)          (o que ESTA obra tem)
  ├─ name                           ├─ project_id
  ├─ position                       ├─ name        ← copiado
  ├─ is_archived                    ├─ position
  └─ (editável pelo admin)          ├─ due_date
                                    ├─ owner_id
          copia na criação  ──────► ├─ status
                                    └─ catalog_id (procedência, nullable)
                                              ▲
                                              │ stage_id (NOT NULL no fim)
                                          tasks
```

**Por que a etapa do projeto é cópia e não referência viva:** a etapa tem prazo,
responsável e status **daquela obra**. Se `project_stages` fosse só um ponteiro
para o catálogo, renomear "Anteprojeto" para "Anteprojeto Executivo" reescreveria
o histórico de todas as obras entregues. `catalog_id` fica guardado como
procedência — é o que permite agrupar "quanto custa um anteprojeto, em média"
sem amarrar o nome.

### Migration 045 — catálogo

```sql
CREATE TABLE stage_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  position    integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

Seed, na ordem do PDF: conceituação, estudo de viabilidade, estudo de massa,
estudo preliminar, anteprojeto, projeto legal, projeto arquitetônico,
complementares, executivo, acompanhamento de obra.

**Mais** todo valor distinto de `tasks.task_type` que exista em produção e não
case com nenhum dos 10:

```sql
INSERT INTO stage_catalog (name, position)
SELECT DISTINCT btrim(task_type), 900
FROM tasks
WHERE task_type IS NOT NULL AND btrim(task_type) <> ''
ON CONFLICT (name) DO NOTHING;
```

Isso resolve o choque que o PDF não viu. A lista de hoje
(`web/src/lib/taskTypes.js`) tem **Compatibilização**, **Detalhamento**,
**Reuniões** e **Outros**, que não existem no catálogo do PDF. Sem esse
`INSERT`, as tarefas marcadas assim ficariam órfãs numa migration com dado real.

`position 900` joga os herdados para o fim da lista — ficam visíveis, separados,
e o João Pedro arquiva ou funde pela tela. Note que "Reuniões" e "Outros" não
são etapas contratuais pela definição do próprio PDF ("tem prazo, tem entrega,
costuma ter parcela de pagamento"); provavelmente vão ser arquivados. Essa é
decisão dele, não da migration.

`is_archived` em vez de `DELETE`: etapa já usada por uma obra não pode sumir.

### Migration 046 — etapas do projeto

```sql
CREATE TYPE stage_status AS ENUM
  ('nao_iniciada', 'em_andamento', 'entregue', 'aprovada');

CREATE TABLE project_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  due_date   date,
  owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  status     stage_status NOT NULL DEFAULT 'nao_iniciada',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
```

Cobre o que o PDF pede: *"Nome, ordem no projeto, prazo de entrega e
responsável"* + *"Status próprio: não iniciada, em andamento, entregue, aprovada
pelo cliente"*.

**Progresso não é coluna.** O PDF pede "progresso calculado pelas tarefas
concluídas (ex.: 5 de 11)" — *calculado*. Vem de `COUNT(*) FILTER (WHERE status
= 'done')` sobre as tarefas da etapa, no mesmo `LEFT JOIN LATERAL` que
`statusProjeto.js` já usa. Coluna denormalizada aqui só criaria oportunidade de
divergir.

### Migration 047 — tarefa pertence a etapa

```sql
ALTER TABLE tasks ADD COLUMN stage_id uuid REFERENCES project_stages(id) ON DELETE RESTRICT;
CREATE INDEX tasks_stage_idx ON tasks(stage_id);
```

Backfill em três passos, na mesma migration:

1. Para cada projeto, criar `project_stages` a partir dos `task_type` distintos
   das tarefas dele, casando com `stage_catalog` por nome.
2. `UPDATE tasks SET stage_id = ...` casando `task_type` com o nome da etapa.
3. Tarefa **sem** `task_type`: cai numa etapa `'Sem etapa'` criada por projeto,
   `position 999`.

O passo 3 é o que permite `NOT NULL`. O PDF exige "campo obrigatório na
criação", e sem uma etapa coringa para o legado a constraint não subiria com
dado real.

`NOT NULL` entra **numa migration separada**, depois que o passo 2 for
verificado em produção. `ALTER TABLE ... SET NOT NULL` que falha no meio de um
deploy é o pior momento para descobrir uma tarefa órfã.

`ON DELETE RESTRICT`: apagar etapa com tarefa dentro tem que falhar. Na tela, a
mensagem é "mova as N tarefas antes de excluir".

### Migration 048 — "Falta info"

```sql
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'blocked' AFTER 'in_progress';
```

Mesmo padrão das migrations 015 e 025, inclusive o cuidado documentado lá de
não usar o valor na mesma transação em que ele é adicionado.

`blocked` e não `waiting_info` porque o rótulo pode mudar; o motivo (travado por
terceiro) não. Front: `web/src/pages/projectBoard/helpers.js`, `COLUMNS` ganha
`{ key: 'blocked', label: 'Falta info' }` entre `in_progress` e `in_review`.

O quadro passa de 4 para 5 colunas — `KanbanBoard.jsx` usa
`xl:grid-cols-4` fixo e precisa virar 5. Vale checar a largura do card em tela
menor; se apertar, a coluna vira scroll horizontal em vez de espremer.

### Templates geram etapas (o "principal ganho")

Hoje `project_templates` + `project_template_items` geram **só tarefas**
(`routes/projects.js:139`). Migration 049:

```sql
CREATE TABLE project_template_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  catalog_id  uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0
);

ALTER TABLE project_template_items
  ADD COLUMN template_stage_id uuid REFERENCES project_template_stages(id) ON DELETE CASCADE;
```

`POST /projects` com `template_id` passa a gerar, na mesma transação que já
existe: primeiro as etapas, depois as tarefas já com `stage_id`. Templates
antigos (itens sem `template_stage_id`) continuam funcionando — as tarefas caem
na etapa 'Sem etapa'. Compatibilidade para trás sem código condicional espalhado.

### Horas por etapa

Sai de graça: `task_time_logs` (migration 012) já amarra tempo à tarefa, e a
tarefa passa a ter etapa. `SUM(duration_minutes)` agrupado por `stage_id`.
O PDF já diz isso — *"não exige trabalho adicional além do vínculo tarefa →
etapa"* — e está certo.

Onde aparece: na trilha de etapas, ao lado do progresso.

---

## 4. A tela do projeto

Segundo o mockup do PDF:

```
┌─────────────────────────────────────────────────────────────┐
│ Grand Terroir 31                          [Em andamento]    │
│ Cliente: Luiz Eduardo Batalha        ← contratante principal│
├─────────────────────────────────────────────────────────────┤
│ Etapas do projeto                       [Gerenciar etapas]  │
│ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│ │✓Concei-│ │✓Viabi- │ │▷Antepro- │ │○Execu- │ │○Acompa-  │ │
│ │ tuação │ │ lidade │ │  jeto    │ │ tivo   │ │ nhamento │ │
│ │████████│ │████████│ │5/11 24/08│ │        │ │          │ │
│ └────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Tarefas · Anteprojeto   [Todas as etapas] [Responsável] [+] │
│ A fazer·3  Fazendo·1  Falta info·1  Revisão·1  Concluído·5  │
└─────────────────────────────────────────────────────────────┘
```

- Trilha no topo, clicar filtra o quadro; "Todas as etapas" mostra o projeto
  inteiro.
- Componente novo `projectBoard/StageTrack.jsx`.
- `EtapaChip.jsx` **muda de fonte**: hoje lê a lista estática de
  `web/src/lib/taskTypes.js`; passa a listar as etapas **daquele projeto**. O
  componente sobrevive; a fonte de dados troca.
- `web/src/lib/taskTypes.js` é apagado no fim do bloco, junto com `task_type`.
- `NewTaskModal.jsx`: etapa vira campo **obrigatório**, pré-preenchido com a
  etapa filtrada no momento.
- Tela de catálogo (admin): CRUD de `stage_catalog`. Cabe ao lado de
  `TemplateManager.jsx`, que já é a tela de configuração de projeto.

**Aceite:** *"Abro um projeto e vejo a trilha de etapas com o progresso; clico em
'anteprojeto' e o quadro mostra só as tarefas dessa etapa; ao criar projeto por
template, etapas e tarefas-padrão já vêm prontas."*

---

## 5. Onde o agente precisa acompanhar

O agente tem tools que leem tarefa e projeto e um lint que cruza prompt ×
registry (`dominioLint.test.js`). Mexer em `task_type` e no board sem mexer nele
deixa o assistente falando de um sistema que não existe mais.

| Arquivo | O que muda |
|---|---|
| `lib/agent/tools/read/statusProjeto.js` | Contagens por status ganham `blocked`; pode ganhar recorte por etapa |
| `lib/agent/tools/read/tasksTravadas.js` | "Travada" agora tem status próprio — `blocked` é exatamente isso |
| `lib/agent/tools/write/proporEditarTask.js` | `task_type` → `stage_id`, resolvido por nome dentro do projeto |
| `lib/agent/context/dominio/*.md` | Vocabulário: etapa, "Falta info", múltiplos contratantes |

`tasksTravadas.js` é o mais interessante: hoje ele infere "travada" por dias
parada. Com `blocked` explícito, a inferência vira dado. Vale revisitar a tool
para usar os dois sinais em vez de só o tempo.

---

## 6. Testes

| Nível | Caso |
|---|---|
| integration | projeto com dois contratantes; ambos na ficha, projeto na ficha dos dois |
| integration | dois `is_primary` no mesmo projeto → rejeitado pelo índice |
| integration | `projects.client_id` acompanha o contratante principal ao trocá-lo |
| integration | apagar cliente que é contratante → `RESTRICT`, erro legível |
| integration | contador de projetos na ficha conta investidor e representante |
| integration | criar tarefa sem etapa → 400 |
| integration | apagar etapa com tarefa → `RESTRICT`, mensagem pedindo para mover |
| integration | progresso da etapa: 5 de 11 com 5 `done` |
| integration | horas por etapa somam os `task_time_logs` das tarefas dela |
| integration | projeto por template gera etapas **e** tarefas com `stage_id` |
| integration | template antigo (sem etapas) gera tarefas em 'Sem etapa' |
| integration | mover tarefa para `blocked` e voltar |
| migration | backfill: `task_type` 'Anteprojeto' → etapa 'Anteprojeto'; `task_type` órfão vira etapa do catálogo herdado; tarefa sem `task_type` → 'Sem etapa' |
| migration | nenhuma tarefa fica com `stage_id` nulo depois do backfill |
| unit | `helpers.js`: `COLUMNS` tem 5 colunas na ordem certa; `statusLabel('blocked')` |
| agent | `dominioLint` continua verde depois da troca de vocabulário |

---

## 7. Ordem de implementação

> Os números 044–049 acima são **indicativos**: `scripts/migrate.js` aplica os
> arquivos por `.sort()` do nome, então o número real é atribuído na hora de
> escrever, seguindo a **dependência** (catálogo antes de `project_stages`,
> `project_stages` antes de `tasks.stage_id`) e não a ordem de implementação
> abaixo.


1. **Item 7** — `project_clients`, backfill, sincronia de `client_id`, ficha e
   contador. Independente das etapas; entrega sozinho.
2. **Migration 048** (`blocked`) + coluna "Falta info" no quadro. Item pequeno,
   isolado, e o único que o estúdio sente no dia seguinte.
3. **Catálogo** — `stage_catalog`, seed com as 10 + herdados, tela de admin.
4. **Etapas do projeto** — `project_stages`, `stage_id` nullable, backfill.
5. **Verificar em produção**, então `SET NOT NULL` e remover `task_type` e
   `web/src/lib/taskTypes.js`.
6. **Trilha na tela** — `StageTrack`, filtro do quadro, `EtapaChip` na fonte nova.
7. **Templates com etapas.**
8. **Agente** — tools e vocabulário.

O passo 5 é a única cerca do bloco: nada depois dele começa antes de o backfill
ser verificado com dado real.
