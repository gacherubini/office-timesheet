# Nova Navegação VOID — menu plano (Design)

Data: 2026-07-24
Escopo: **navegação / arquitetura de informação**. Primeiro passo do redesenho baseado no
mockup "Gestão VOID". Não redesenha o conteúdo interno das páginas — apenas a barra lateral,
os itens de menu e o mapa de rotas. As páginas continuam as que já existem.

## Contexto

O app atual usa uma sidebar com categorias aninhadas que mudam por papel (colaborador vê
`Início / Rotina / Financeiro / Gerenciamento`; admin vê outro conjunto). O mockup define um
menu **plano e igual para todos**: `Home · Tarefas · Projetos · Pessoas · Agenda · Performance`.

Decisão tomada no brainstorming: **Opção 1 — menu plano para todos**. As ferramentas extras de
admin (que o mockup não mostra) viram **sub-itens aninhados**, visíveis apenas para admin,
dentro dos itens pai adequados.

Duas telas do mockup (Tarefas global e Pessoas unificada) ainda não têm página própria no
sistema; serão construídas em passos futuros. Neste passo, seus itens de menu **apontam para a
página existente mais próxima** — sem link morto.

## Objetivos deste passo

1. Reescrever a sidebar (`web/src/components/Layout.jsx`) no formato plano do mockup, com o
   visual VOID (fundo verde escuro, item ativo em laranja/accent).
2. Mesmo topo de 6 itens para todos os papéis.
3. Sub-itens só-admin aninhados sob os itens pai.
4. Criar rotas em português apontando para as páginas atuais; manter as rotas antigas
   funcionando (alias) para não quebrar deep-links.

## Fora de escopo (passos futuros)

- Construir a página **Tarefas** (board global cross-project).
- Construir a página **Pessoas** unificada (Clientes/Colaboradores/Fornecedores/Parceiros, PF/PJ).
- Redesenhar a **Home**, a **Agenda** (presença semanal), a **página do projeto** e o
  **pop-up de tarefa**.
- Qualquer mudança de backend.

## Menu proposto (todos os papéis)

Topo idêntico para colaborador e admin:

| Ordem | Item | Rota | Página atual usada |
|---|---|---|---|
| 1 | **Home** | `/dashboard` (colab) · `/admin/dashboard` (admin) | `EmployeeDashboardPage` / `AdminDashboardPage` |
| 2 | **Tarefas** | `/tarefas` | `ProjectBoardPage` (interino) |
| 3 | **Projetos** | `/projetos` | `ProjectBoardPage` |
| 4 | **Pessoas** | `/pessoas` | `AdminClientsPage` (interino) |
| 5 | **Agenda** | `/agenda` | `VacationCalendarPage` (interino) |
| 6 | **Performance** | `/performance` | `FinancialPerspectivePage` |

Observação: **Tarefas** e **Projetos** hoje renderizam o mesmo componente `ProjectBoardPage`
(que já contém catálogo → quadro). É aceitável neste passo; a separação real acontece quando a
página Tarefas global for construída.

### Sub-itens só-admin (aninhados, expansíveis)

- Sob **Home**: `Painel Live` → `/admin/live`
- Sob **Pessoas**: `Equipe` → `/admin/team` · `Aprovações` → `/admin/approvals` ·
  `Excluídos` → `/admin/deleted-users`
- Sob **Performance**: `Relatórios` → `/admin/reports` · `Apontamentos` → `/admin/time-entries` ·
  `Bônus` → `/admin/manage-bonuses` · `Despesas` → `/admin/manage-expenses`

### Estagiário administrativo (papel de borda)

`isAdministrativeIntern` não pode abrir `/dashboard`, `/financial-perspective` nem `/expenses`
(guarda `disallowAdministrativeIntern` em `ProtectedRoute`). Para ele o menu plano é um
**subconjunto**, evitando links que ele não pode abrir:

- **Home** aponta para `/admin/approvals` (a home dele hoje).
- **Performance** fica **oculto** (não tem acesso).
- **Tarefas / Projetos / Pessoas / Agenda** aparecem normalmente.
- Sub-itens visíveis: `Painel Live`, `Equipe`, `Aprovações` (os que já podia ver).

Nenhuma permissão nova é criada; apenas reaproveitamos as guardas existentes.

## Rotas

Novas rotas em português, adicionadas em `web/src/App.jsx`:

- `/tarefas` → `ProjectBoardPage`
- `/projetos` → `ProjectBoardPage`
- `/pessoas` → `AdminClientsPage`
- `/agenda` → `VacationCalendarPage`
- `/performance` → `FinancialPerspectivePage`

**Compatibilidade:** as rotas antigas (`/project-board`, `/financial-perspective`, `/clients`,
`/vacation-calendar`, etc.) continuam registradas renderizando o mesmo componente, para
preservar deep-links existentes (ex.: `/project-board?project=<id>` e `?task=<id>`). Não usar
`<Navigate>` que descarte query params — manter as rotas antigas como aliases vivos.

## Design da sidebar

Baseado no mockup (páginas 2–13):

- Fundo: verde escuro atual (`var(--color-sidebar)`).
- Logo VOID + "GESTÃO VOID" no topo (já existe).
- Lista plana de 6 itens, cada um com ícone (lucide) à esquerda.
- **Item ativo:** texto na cor accent (laranja), como no mockup. Itens inativos em
  `text-white/60` com hover mais claro. (Substitui o "pill" de fundo atual pelo destaque em
  laranja do mockup; um leve realce de fundo pode ser mantido se ficar melhor.)
- Sub-itens admin: aparecem indentados sob o pai, expandem/recolhem (reaproveitar a lógica
  `NavSection` existente).
- Rodapé: avatar + nome + e-mail + "Sair" (já existe).
- **Preservar** funcionalidades atuais que não estão no mockup mas agregam: fixar/soltar
  sidebar (pin), expandir no hover quando recolhida, e o toggle de tema claro/escuro.

### Mapeamento de ícones (lucide)

- Home → `Home`
- Tarefas → `ListChecks` (ou `CheckSquare`)
- Projetos → `FolderKanban`
- Pessoas → `Users`
- Agenda → `CalendarDays`
- Performance → `BarChart3`

## Componentes afetados

- `web/src/components/Layout.jsx` — reescrita das listas de navegação (`employeeSections`,
  `adminSections`, `administrativeInternSections`) para o modelo plano + sub-itens admin;
  ajuste do estado ativo para o estilo do mockup. Reaproveitar `NavCategoryLink`,
  `NavLinkItem`, `NavSection`.
- `web/src/App.jsx` — novas rotas em português como aliases das páginas atuais.

## Critérios de aceite

1. Colaborador e admin veem o mesmo topo: Home · Tarefas · Projetos · Pessoas · Agenda · Performance.
2. Admin vê sub-itens aninhados sob Home/Pessoas/Performance; colaborador não.
3. Cada item leva a uma página que renderiza (nenhum link morto, nenhum 404).
4. Deep-links antigos (`/project-board?project=…`, `?task=…`) continuam funcionando.
5. Item ativo destacado em laranja conforme mockup.
6. Pin, hover-expand e toggle de tema continuam funcionando.
7. `npm run build` do `web/` passa sem erros.

## Riscos

- Estagiário administrativo: tratado na seção "papel de borda" acima — Home → `/admin/approvals`
  e Performance oculto, respeitando as guardas de `ProtectedRoute` já existentes.
- `ProjectBoardPage` servindo tanto `/tarefas` quanto `/projetos` é intencional e temporário.
