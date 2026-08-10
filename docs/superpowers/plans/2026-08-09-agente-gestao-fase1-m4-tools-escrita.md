# Agente de Gestão — Fase 1, Milestone 4 (Novas tools de ESCRITA + confirmação humana) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alargar o agente para além da única tool de escrita já entregue (`propor_encerrar_apontamento`), acrescentando **duas ações de escrita novas** — `propor_criar_apontamento` (iniciar o timer falando) e `propor_criar_task` (abrir tarefa falando) — pelo **mesmo** fluxo human-in-the-loop já provado: o modelo **propõe**, o código **executa** após revalidar. Cada tool espelha um endpoint `requireAuth` (todos os papéis), então **nada de novo é liberado**: o agente só propõe o que a pessoa já faria pelo site. É a materialização do §8.1 — "o valor do agente para o colaborador está na escrita".

**Architecture:** Uma tool de escrita é o objeto `{ kind:'write', espelha, roles, definition, propose, execute }` em `src/lib/agent/tools/write/` — exatamente o shape do `proporEncerrarApontamento.js` já em produção. O `loop.js` pausa numa tool `kind:'write'`, chama `propose` (que **descreve** o efeito, não muta), grava a pendência via `createProposal` e emite `{type:'proposal', proposalId, descricao, dados}`, devolvendo `status:'awaiting_confirmation'`. O `routes/agent.js` roteia o `execute` pelo mapa `WRITE_TOOLS` (`kind → módulo`) em `POST /agent/actions/:proposalId/execute`, depois de `takeProposal` (uso único, TTL 5 min, checagem de mesmo usuário) e antes de `auditAgentAction`. **O núcleo (loop, propostas, rota) não muda** — só ganham entradas o `registry` e o `WRITE_TOOLS`.

**Tech Stack:** Node/Express 5 (ESM), Postgres (`pg`), `openai` (endpoint OpenAI-compatible), Vitest + Supertest, factories de `src/tests/helpers/`.

**Origem:** design em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — **§8.3** (tools de escrita: `propor_criar_apontamento`, `propor_criar_task`), **§10** (fluxo de confirmação), **§9 camadas 2–4 e 6** (propor×executar, permissão na execução, auditoria), **§13** (eval set: exigir confirmação, não afirmar feito). Template estrutural: `docs/superpowers/plans/2026-08-09-agente-gestao-fase1-m2-tools-leitura.md`.

---

> **Notas de escopo (2026-08-09), decididas ao escrever este plano contra o código:**
>
> 1. **Por que estas duas tools, e só estas.** O §8.3 nomeia `propor_criar_apontamento`, `propor_encerrar_apontamento` (já feita no esqueleto) e `propor_criar_task`, mais "(demais ações de escrita seguem o mesmo padrão)". As duas escolhidas são as duas nomeadas que **faltam**, e ambas espelham endpoints `requireAuth` liberados a **qualquer papel**: `POST /time-entries/start` (`timeEntries.js:109`) e `POST /projects/:id/tasks` (`projectManagement.js:18`, com o comentário literal *"Criar tarefas é liberado a qualquer usuário logado"* em `projectManagement.js:31`). Isso torna a **paridade de papel trivial** (todos os quatro papéis, sem recorte de coluna) e entrega logo o valor do §8.1 para o colaborador. Escrita com guard mais estreito — pedir férias (`POST /vacation-requests`), lançar despesa, aprovar solicitação — mistura papéis diferentes e re-checagem de permissão por papel no `execute`; fica para um M5, registrado no Self-Review. **Dois é o lote bem-escopado.**
>
> 2. **Resolução de projeto por nome é parte da tool, não do endpoint.** Os endpoints espelhados recebem `project_id` (no body ou na URL). O modelo não conhece UUIDs — ele fala "inicia no projeto Acme". Então as duas tools recebem **nome** e resolvem para `project_id` por query (`ILIKE`), tratando "não achei" e "achei mais de um" como **erro legível** que vira pedido de esclarecimento (§6, ambiguidade → perguntar). Isso não amplia alcance: resolve para um id que a pessoa já alcançaria; se não resolver, não propõe.
>
> 3. **`execute` revalida ESTADO; papel não há o que re-checar aqui.** O invariante manda `execute` re-checar permissão *e* estado. Como as duas tools são de **todos os papéis**, não existe gate de papel para reabrir — a revalidação que importa é de **estado** (já tem apontamento aberto? está de férias hoje? o projeto ainda existe?), exatamente como o `proporEncerrarApontamento.execute` revalida "ainda aberto E ainda seu". Deixo isso explícito no código e no Self-Review: **quando um M5 trouxer uma tool que espelhe endpoint com guard por papel, o `execute` dela terá de re-checar o papel também** — aqui não tem porque o endpoint é `requireAuth` puro.
>
> 4. **Expiração da proposta é testada no nível de `proposals.js`, não na rota.** O `takeProposal` aceita um `now` injetável (`proposals.js:15`), mas a rota o chama com o relógio real (`agent.js:56`) — não dá para forjar expiração via HTTP sem controlar o tempo. Logo: **uso único** e **usuário errado** são testados na rota (Task 5); **expiração** já está coberta de forma determinística no unit de `proposals.js` (`proposals.test.js:20`), que vale para **qualquer** `kind`, inclusive os novos. Não duplico.

---

## Global Constraints

Copiadas do escopo deste milestone. Todo task as respeita.

- **Paridade de escrita (§8.3):** uma tool de escrita só pode propor uma ação que o papel do usuário já permite via o guard do endpoint espelhado — verifique o guard real da rota e defina `roles` para bater; nada de novo é liberado. O `execute` re-checa permissão e estado atual (o papel/estado pode mudar entre o propor e o aprovar).
- **Propor × executar:** o `propose` nunca muta; só o `execute` muta, após revalidação. Nunca relatar uma ação como feita antes de o `execute` ter sucesso.
- **Auditoria:** todo `execute` é auditado via `auditAgentAction` (já cabeado na rota).
- Shape da tool, ESM, comentários pt-BR, Vitest/Supertest com as factories do repo, datas via `format.js`.

**Fatos do código (file:line) que sustentam o plano:**

- Shape provado da tool de escrita: `src/lib/agent/tools/write/proporEncerrarApontamento.js:75-80` (`{ kind:'write', espelha, roles, definition, propose, execute }`).
- Pausa e emissão da proposta: `src/lib/agent/loop.js:39-48` (chama `propose`, `createProposal`, emite `proposal`, retorna `awaiting_confirmation`).
- Pendências em memória, uso único, TTL 5 min, mesmo-usuário: `src/lib/agent/proposals.js:5,9-13,15-22`.
- Roteamento do `execute`: `src/routes/agent.js:17` (`WRITE_TOOLS`), `:55-68` (`takeProposal` → `tool.execute` → `auditAgentAction`).
- Registry filtrado por papel: `src/lib/agent/tools/registry.js:12-24`.
- Endpoint espelhado 1 — **iniciar timer**: `src/routes/timeEntries.js:109` `POST /time-entries/start`, guards `requireAuth, blockTimerDuringVacation`; INSERT em `:117-121`; conflito de apontamento aberto (índice único) tratado em `:131-133`; bloqueio de férias em `:35-50` + `:21-33`.
- Índice único de apontamento aberto: `src/migrations/006_time_entries.sql:21-23` (`one_open_entry_per_user` em `status IN ('running','paused')`).
- Endpoint espelhado 2 — **criar tarefa**: `src/routes/projectManagement.js:18` `POST /projects/:id/tasks`, guard `requireAuth`, "liberado a qualquer usuário logado" (`:31`); validações `title` obrigatório (`:23`) e `priority` em low/medium/high (`:26-27`); cálculo de `position` (`:35-40`); INSERT (`:42-57`).
- Colunas de `tasks`: base em `src/migrations/012_project_management.sql:18-31`; `priority task_priority DEFAULT 'medium'` em `src/migrations/013_task_collaboration.sql:6,9`; `task_type text` em `src/migrations/027_task_type.sql:5`.
- Formatação/fuso: `src/lib/agent/format.js:3` (`TZ`), `:18-22` (`formatDateBR`).

---

## File Structure

**Novas tools (`src/lib/agent/tools/write/`)**
- `proporCriarApontamento.js` — todos os papéis — espelha `POST /time-entries/start`.
- `proporCriarTask.js` — todos os papéis — espelha `POST /projects/:id/tasks`.

**Modificados**
- `src/lib/agent/tools/registry.js` — registrar as 2 tools novas.
- `src/routes/agent.js` — 2 imports + 2 entradas no mapa `WRITE_TOOLS`.
- `src/lib/agent/context/dominio/core.md` — descrever as duas ações de escrita (são de todos os papéis → núcleo comum).
- `src/lib/agent/evals/cases.js` — casos novos (§13).

**Testes**
- Integração (exigem Postgres de teste): `src/tests/integration/agent/criarApontamento.test.js`, `criarTask.test.js`, e ampliação de `src/tests/integration/agent/route.test.js` (fluxo de confirmação ponta-a-ponta dos dois novos `kind`).
- Unit (sem banco): ampliar `src/tests/unit/agent/registry.test.js` e `src/tests/unit/agent/prompt.test.js`.

---

## Task 1: Tool `propor_criar_apontamento` (todos os papéis) — espelha `POST /time-entries/start`

Iniciar o próprio apontamento (timer) por conversa. `propose` resolve o projeto pelo nome e checa as duas guardas de estado do endpoint (não ter apontamento aberto — índice `one_open_entry_per_user`; não estar de férias aprovadas hoje — `blockTimerDuringVacation`). `execute` **revalida as duas** e insere o `running`.

**Files:**
- Create: `src/lib/agent/tools/write/proporCriarApontamento.js`
- Test: `src/tests/integration/agent/criarApontamento.test.js`

**Interfaces:**
- Consumes: `../../../db.js` (`query`).
- Produces: default export `{ kind:'write', espelha:'POST /time-entries/start', roles:['admin','administrative_intern','project_manager','employee'], definition, propose, execute }`.
  - `definition.function.name = 'propor_criar_apontamento'`, `parameters`: `{ projeto: string (nome do projeto ativo, obrigatório) }`.
  - `propose(profile, { projeto }) → { kind:'criar_apontamento', payload:{ project_id }, descricao, dados }`.
  - `execute(profile, payload) → { before, after }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/criarApontamento.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject, makeRunningEntry, makeApprovedVacation } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporCriarApontamento.js'

describe('tool propor_criar_apontamento', () => {
  let emp, projeto
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', hourly_rate: 120 })
    projeto = await makeProject({ name: 'Acme' })
  })

  it('propose descreve iniciar o apontamento no projeto resolvido pelo nome', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme' })
    expect(p.kind).toBe('criar_apontamento')
    expect(p.payload.project_id).toBe(projeto.id)
    expect(p.descricao).toMatch(/Acme/)
    // propose NÃO muta: nenhum apontamento foi criado.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose sem projeto → erro legível (pede o projeto)', async () => {
    await expect(tool.propose(emp, {})).rejects.toThrow(/qual projeto|projeto/i)
  })

  it('propose com nome que não existe → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Inexistente' })).rejects.toThrow(/não encontrei/i)
  })

  it('propose com nome ambíguo (dois projetos) → pede para especificar', async () => {
    await makeProject({ name: 'Acme Reforma' })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/mais de um|especifique|específic/i)
  })

  it('propose já com apontamento aberto → erro (não propõe segundo)', async () => {
    await makeRunningEntry({ user_id: emp.id, project_id: projeto.id, started_at: new Date() })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/já tem um apontamento aberto/i)
  })

  it('propose durante férias aprovadas hoje → erro (timer bloqueado)', async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    await makeApprovedVacation({ user_id: emp.id, start_date: hoje, end_date: hoje, days_count: 1 })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/férias/i)
  })

  it('execute cria o apontamento running e devolve antes/depois', async () => {
    const { before, after } = await tool.execute(emp, { project_id: projeto.id })
    expect(before.aberto).toBe(false)
    expect(after.status).toBe('running')
    expect(after.project_id).toBe(projeto.id)
    const { rows } = await query(
      `SELECT status FROM time_entries WHERE user_id = $1 AND project_id = $2`,
      [emp.id, projeto.id],
    )
    expect(rows[0].status).toBe('running')
  })

  it('execute revalida: já há apontamento aberto AGORA → recusa e não cria outro', async () => {
    await makeRunningEntry({ user_id: emp.id, project_id: projeto.id, started_at: new Date() })
    await expect(tool.execute(emp, { project_id: projeto.id })).rejects.toThrow(/já tem um apontamento aberto/i)
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1`, [emp.id])
    expect(rows[0].n).toBe(1) // só o que já existia
  })

  it('execute revalida: entrou de férias entre propor e aprovar → recusa', async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    await makeApprovedVacation({ user_id: emp.id, start_date: hoje, end_date: hoje, days_count: 1 })
    await expect(tool.execute(emp, { project_id: projeto.id })).rejects.toThrow(/férias/i)
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1`, [emp.id])
    expect(rows[0].n).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/criarApontamento.test.js`
Expected: FAIL — módulo `proporCriarApontamento.js` inexistente. (Exige o Postgres de teste de pé — ver "Pré-requisitos de ambiente".)

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/write/proporCriarApontamento.js
// Espelha POST /time-entries/start (requireAuth, todos os papéis): inicia o
// PRÓPRIO apontamento. propose só descreve; execute revalida e insere. As duas
// guardas de estado do endpoint são replicadas: (1) o índice único
// one_open_entry_per_user impede segundo apontamento aberto; (2)
// blockTimerDuringVacation impede iniciar durante férias aprovadas de hoje.
// Nada de novo é liberado — a rota já permite isto a qualquer autenticado.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_criar_apontamento',
    description: 'Propõe iniciar um novo apontamento (timer) do próprio usuário num projeto. Requer confirmação. Não pode haver outro apontamento aberto nem férias aprovadas hoje.',
    parameters: {
      type: 'object',
      properties: { projeto: { type: 'string', description: 'nome do projeto ativo onde iniciar o timer' } },
      required: ['projeto'],
      additionalProperties: false,
    },
  },
}

// Resolve um projeto ATIVO pelo nome. Erros viram pedido de esclarecimento (§6).
async function resolverProjeto(nome) {
  const alvo = (nome || '').trim()
  if (!alvo) throw new Error('Qual projeto? Diga o nome do projeto para iniciar o apontamento.')
  const { rows } = await query(
    `SELECT id, name FROM projects WHERE status = 'active' AND name ILIKE $1 ORDER BY name`,
    [alvo],
  )
  if (rows.length === 0) throw new Error(`Não encontrei um projeto ativo chamado "${alvo}".`)
  if (rows.length > 1) throw new Error(`Há mais de um projeto ativo com esse nome; especifique melhor "${alvo}".`)
  return rows[0]
}

async function temApontamentoAberto(userId) {
  const { rows } = await query(
    `SELECT 1 FROM time_entries WHERE user_id = $1 AND status IN ('running','paused') LIMIT 1`,
    [userId],
  )
  return rows.length > 0
}

// Férias aprovadas cobrindo HOJE no fuso do estúdio (mesma regra do endpoint).
async function deFeriasHoje(userId) {
  const { rows } = await query(
    `SELECT 1 FROM vacation_requests
      WHERE user_id = $1 AND status = 'approved'
        AND start_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND end_date   >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      LIMIT 1`,
    [userId],
  )
  return rows.length > 0
}

async function propose(profile, args) {
  const projeto = await resolverProjeto(args?.projeto)
  if (await temApontamentoAberto(profile.id)) {
    throw new Error('Você já tem um apontamento aberto. Encerre o atual antes de iniciar outro.')
  }
  if (await deFeriasHoje(profile.id)) {
    throw new Error('Você está de férias aprovadas hoje; o timer fica bloqueado.')
  }
  return {
    kind: 'criar_apontamento',
    payload: { project_id: projeto.id },
    descricao: `Iniciar um apontamento no projeto "${projeto.name}" agora.`,
    dados: { project_id: projeto.id, projeto: projeto.name },
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO (pode ter mudado entre propor e aprovar). Não há papel a
  // re-checar: a rota espelhada é requireAuth para todos os papéis.
  if (await temApontamentoAberto(profile.id)) {
    throw new Error('Você já tem um apontamento aberto. Encerre o atual antes de iniciar outro.')
  }
  if (await deFeriasHoje(profile.id)) {
    throw new Error('Você está de férias aprovadas hoje; o timer fica bloqueado.')
  }
  try {
    const { rows } = await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now(), 'running')
       RETURNING id, user_id, project_id, started_at, status`,
      [profile.id, payload.project_id],
    )
    return { before: { aberto: false }, after: rows[0] }
  } catch (err) {
    // Backstop do índice único parcial one_open_entry_per_user.
    if (err.code === '23505') throw new Error('Você já tem um apontamento aberto.')
    throw err
  }
}

export default {
  kind: 'write',
  espelha: 'POST /time-entries/start',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/criarApontamento.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/write/proporCriarApontamento.js src/tests/integration/agent/criarApontamento.test.js
git commit -m "feat(agente): tool propor_criar_apontamento (espelha POST /time-entries/start, com revalidacao)"
```

---

## Task 2: Tool `propor_criar_task` (todos os papéis) — espelha `POST /projects/:id/tasks`

Abrir tarefa por conversa. `propose` valida `titulo` e `prioridade` como o endpoint faz, resolve o projeto pelo nome. `execute` revalida que o projeto ainda existe, calcula a `position` como a rota (fim da coluna `todo`) e insere com `created_by = profile.id`, `status` default `todo`.

**Files:**
- Create: `src/lib/agent/tools/write/proporCriarTask.js`
- Test: `src/tests/integration/agent/criarTask.test.js`

**Interfaces:**
- Produces: `{ kind:'write', espelha:'POST /projects/:id/tasks', roles:['admin','administrative_intern','project_manager','employee'], definition, propose, execute }`.
  - name `propor_criar_task`, params `{ projeto: string (obrigatório), titulo: string (obrigatório), prioridade?: 'low'|'medium'|'high' }`.
  - `propose → { kind:'criar_task', payload:{ project_id, title, priority }, descricao, dados }`.
  - `execute → { before, after }`, `after` = a task criada.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/criarTask.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporCriarTask.js'

describe('tool propor_criar_task', () => {
  let emp, projeto
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    projeto = await makeProject({ name: 'Acme' })
  })

  it('propose descreve criar a tarefa no projeto resolvido pelo nome', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'Revisar layout' })
    expect(p.kind).toBe('criar_task')
    expect(p.payload.project_id).toBe(projeto.id)
    expect(p.payload.title).toBe('Revisar layout')
    expect(p.payload.priority).toBe('medium') // default espelhado do endpoint
    expect(p.descricao).toMatch(/Revisar layout/)
    // propose NÃO muta.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1', [projeto.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose sem título → erro legível (título obrigatório)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: '   ' })).rejects.toThrow(/título/i)
  })

  it('propose com prioridade inválida → erro (low/medium/high)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X', prioridade: 'urgente' }))
      .rejects.toThrow(/prioridade/i)
  })

  it('propose com projeto inexistente → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Nada', titulo: 'X' })).rejects.toThrow(/não encontrei/i)
  })

  it('execute cria a task no fim da coluna todo e devolve antes/depois', async () => {
    // Já existe uma task em todo → a nova entra na position seguinte.
    await query(
      `INSERT INTO tasks (project_id, title, status, position, created_by) VALUES ($1,'T0','todo',0,$2)`,
      [projeto.id, emp.id],
    )
    const { before, after } = await tool.execute(emp, { project_id: projeto.id, title: 'Nova', priority: 'high' })
    expect(before).toBeNull()
    expect(after.title).toBe('Nova')
    expect(after.status).toBe('todo')
    expect(after.priority).toBe('high')
    expect(after.position).toBe(1)
    expect(after.created_by).toBe(emp.id)
  })

  it('execute revalida: projeto sumiu entre propor e aprovar → recusa', async () => {
    await query('DELETE FROM projects WHERE id = $1', [projeto.id])
    await expect(tool.execute(emp, { project_id: projeto.id, title: 'X', priority: 'medium' }))
      .rejects.toThrow(/projeto/i)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/criarTask.test.js`
Expected: FAIL — módulo `proporCriarTask.js` inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/write/proporCriarTask.js
// Espelha POST /projects/:id/tasks (requireAuth, "liberado a qualquer usuário
// logado"): abre uma tarefa num projeto. propose valida como a rota (título
// obrigatório, prioridade low/medium/high) e resolve o projeto pelo nome;
// execute revalida que o projeto existe, calcula a position no fim da coluna
// 'todo' e insere com created_by do próprio usuário. Nada de novo é liberado.
import { query } from '../../../db.js'

const PRIORIDADES = ['low', 'medium', 'high']

const definition = {
  type: 'function',
  function: {
    name: 'propor_criar_task',
    description: 'Propõe criar uma tarefa num projeto (entra na coluna "a fazer"). Requer confirmação. Prioridade opcional: low, medium ou high (padrão medium).',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto onde criar a tarefa' },
        titulo: { type: 'string', description: 'título da tarefa' },
        prioridade: { type: 'string', enum: PRIORIDADES, description: 'prioridade; padrão medium' },
      },
      required: ['projeto', 'titulo'],
      additionalProperties: false,
    },
  },
}

// Resolve um projeto pelo nome (sem filtrar por status — a rota não filtra).
async function resolverProjeto(nome) {
  const alvo = (nome || '').trim()
  if (!alvo) throw new Error('Em qual projeto? Diga o nome do projeto para criar a tarefa.')
  const { rows } = await query(
    `SELECT id, name FROM projects WHERE name ILIKE $1 ORDER BY name`,
    [alvo],
  )
  if (rows.length === 0) throw new Error(`Não encontrei um projeto chamado "${alvo}".`)
  if (rows.length > 1) throw new Error(`Há mais de um projeto com esse nome; especifique melhor "${alvo}".`)
  return rows[0]
}

async function propose(profile, args) {
  const titulo = (args?.titulo || '').trim()
  if (!titulo) throw new Error('Qual o título da tarefa?')
  const prioridade = args?.prioridade
  if (prioridade !== undefined && !PRIORIDADES.includes(prioridade)) {
    throw new Error('Prioridade inválida. Use low, medium ou high.')
  }
  const projeto = await resolverProjeto(args?.projeto)
  const priority = prioridade || 'medium'
  return {
    kind: 'criar_task',
    payload: { project_id: projeto.id, title: titulo, priority },
    descricao: `Criar a tarefa "${titulo}" (prioridade ${priority}) no projeto "${projeto.name}".`,
    dados: { project_id: projeto.id, projeto: projeto.name, titulo, prioridade: priority },
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO: o projeto ainda existe? (pode ter sido removido).
  const { rows: existe } = await query('SELECT 1 FROM projects WHERE id = $1', [payload.project_id])
  if (existe.length === 0) throw new Error('O projeto não existe mais.')

  // position = fim da coluna 'todo' — mesmo cálculo do endpoint.
  const { rows: posRows } = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks WHERE project_id = $1 AND status = 'todo'`,
    [payload.project_id],
  )
  const position = posRows[0].next

  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, priority, position, created_by)
     VALUES ($1, $2, $3::task_priority, $4, $5)
     RETURNING id, project_id, title, status, priority, position, created_by, created_at`,
    [payload.project_id, payload.title, payload.priority, position, profile.id],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /projects/:id/tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/criarTask.test.js`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/write/proporCriarTask.js src/tests/integration/agent/criarTask.test.js
git commit -m "feat(agente): tool propor_criar_task (espelha POST /projects/:id/tasks, com revalidacao)"
```

---

## Task 3: Cabeamento — registry + mapa `WRITE_TOOLS` + teste de roteamento

**Toda tool de escrita nova entra em DOIS lugares:** no `registry.js` (para o modelo receber a *definição* e o `loop` chamar o `propose`) e no mapa `WRITE_TOOLS` do `routes/agent.js` (para o `execute` rotear a proposta pelo `kind`). Sem a segunda, a proposta é criada mas o `execute` responde *"Tipo de proposta desconhecido"* (`agent.js:60`). Este task fecha os dois e prova o roteamento por `kind`.

**Files:**
- Modify: `src/lib/agent/tools/registry.js`
- Modify: `src/routes/agent.js`
- Test: `src/tests/unit/agent/registry.test.js` (ampliar)
- Test: `src/tests/integration/agent/route.test.js` (ampliar — roteamento por `kind`)

- [ ] **Step 1: Write the failing tests**

Acrescente ao `src/tests/unit/agent/registry.test.js`:

```javascript
describe('registry — tools de escrita do M4 por papel', () => {
  it('todos os papéis recebem as duas tools de escrita novas', () => {
    for (const role of ['admin', 'administrative_intern', 'project_manager', 'employee']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).toContain('propor_criar_apontamento')
      expect(nomes).toContain('propor_criar_task')
    }
  })
})
```

Acrescente ao `src/tests/integration/agent/route.test.js` (dentro do `describe('POST /agent/chat + execute')`), um teste que prova que cada `kind` roteia para o `execute` certo pela rota:

```javascript
  it('proposta criar_task → evento proposal; execute cria a tarefa (roteamento por kind)', async () => {
    setClient(fakeClientOnce({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_criar_task', arguments: JSON.stringify({ projeto: 'Projeto Y', titulo: 'Do agente' }) } }],
    }))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'cria uma tarefa' })
    const prop = (await readSse(chat)).find((e) => e.type === 'proposal')
    expect(prop.proposalId).toBeTruthy()
    expect(prop.descricao).toMatch(/Do agente/)

    const exec = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(200)
    expect(exec.body.resultado.title).toBe('Do agente')

    const { rows } = await query('SELECT status FROM tasks WHERE project_id = $1', [project.id])
    expect(rows[0].status).toBe('todo')
  })
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js tests/integration/agent/route.test.js`
Expected: FAIL — registry ainda sem as tools novas; a rota responde 400 *"Tipo de proposta desconhecido"* no `criar_task` porque o `WRITE_TOOLS` não tem a entrada.

- [ ] **Step 3: Implement — registrar e mapear**

Em `src/lib/agent/tools/registry.js`, importe e inclua na lista `TODAS`:

```javascript
import proporCriarApontamento from './write/proporCriarApontamento.js'
import proporCriarTask from './write/proporCriarTask.js'
```

```javascript
const TODAS = [
  listarEquipe, proporEncerrarApontamento,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  proporCriarApontamento, proporCriarTask,
]
```

Em `src/routes/agent.js`, importe os dois módulos e amplie o mapa `WRITE_TOOLS`:

```javascript
import proporEncerrarApontamento from '../lib/agent/tools/write/proporEncerrarApontamento.js'
import proporCriarApontamento from '../lib/agent/tools/write/proporCriarApontamento.js'
import proporCriarTask from '../lib/agent/tools/write/proporCriarTask.js'
```

```javascript
// Mapa kind → módulo de tool de escrita (para o execute rotear a proposta).
const WRITE_TOOLS = {
  encerrar_apontamento: proporEncerrarApontamento,
  criar_apontamento: proporCriarApontamento,
  criar_task: proporCriarTask,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js tests/integration/agent/route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/registry.js src/routes/agent.js src/tests/unit/agent/registry.test.js src/tests/integration/agent/route.test.js
git commit -m "feat(agente): registra propor_criar_apontamento/task no registry e no WRITE_TOOLS (roteamento por kind)"
```

---

## Task 4: Domínio (`dominio/`) descreve as duas ações de escrita

Sem isto o modelo não sabe que pode **iniciar apontamento** nem **criar tarefa** por conversa. Como as duas tools são de **todos os papéis**, a descrição entra no **núcleo comum** (`core.md`) — que todo papel recebe (`prompt.js:22`).

**Files:**
- Modify: `src/lib/agent/context/dominio/core.md`
- Test: `src/tests/unit/agent/prompt.test.js` (ampliar)

- [ ] **Step 1: Write the failing test**

Acrescente em `src/tests/unit/agent/prompt.test.js`:

```javascript
it('domínio (todos os papéis) cita as ações de escrita: iniciar apontamento e criar tarefa', () => {
  for (const role of ['admin', 'employee']) {
    const p = buildSystemPrompt({ role })
    expect(p).toMatch(/iniciar (um )?apontamento|começar o timer/i)
    expect(p).toMatch(/criar (uma )?tarefa/i)
    expect(p).toMatch(/confirma/i) // deixa claro que escrita é sempre confirmada
  }
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: FAIL — os termos ainda não estão no `core.md`.

- [ ] **Step 3: Implement — ampliar o `core.md`**

Adicione ao fim de `src/lib/agent/context/dominio/core.md`:

```markdown

## O que você pode PROPOR (escrita, sempre com confirmação)
Estas ações não são executadas na hora: você **propõe**, o usuário confirma, e só
então o sistema executa. Nunca diga que fez antes da confirmação.
- **iniciar um apontamento** (começar o timer) num projeto — só se a pessoa não
  tiver outro apontamento aberto e não estiver de férias hoje.
- **criar uma tarefa** num projeto (entra na coluna "a fazer"), com prioridade
  opcional (low, medium, high).
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context/dominio/core.md src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): dominio descreve as acoes de escrita (iniciar apontamento, criar tarefa)"
```

---

## Task 5: Fluxo de confirmação na rota — revalidação, auditoria, uso único e usuário errado

Cobre o §10 ponta-a-ponta **para os novos `kind`**, no nível da rota, espelhando `route.test.js`: propor → executar → revalidar → auditar; uso único (repetir dá 404); usuário errado (outra pessoa não executa a proposta). A **expiração** já está coberta de forma determinística em `proposals.test.js:20` (via o `now` injetável do `takeProposal`), e vale para qualquer `kind` — não se repete aqui, por honestidade: a rota chama `takeProposal` com o relógio real (`agent.js:56`) e não há como forjar tempo por HTTP.

**Files:**
- Modify: `src/tests/integration/agent/route.test.js` (ampliar)

- [ ] **Step 1: Write the failing tests**

Acrescente ao `describe('POST /agent/chat + execute')` de `src/tests/integration/agent/route.test.js` (o helper `fakeClientOnce`, `readSse`, `asUser` e os `beforeEach` já existem no arquivo):

```javascript
  it('criar_apontamento: propor → executar audita e cria running; repetir dá 404 (uso único)', async () => {
    setClient(fakeClientOnce({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_criar_apontamento', arguments: JSON.stringify({ projeto: 'Projeto Y' }) } }],
    }))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'começa meu timer no Projeto Y' })
    const prop = (await readSse(chat)).find((e) => e.type === 'proposal')
    expect(prop.proposalId).toBeTruthy()

    const exec = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(200)
    expect(exec.body.resultado.status).toBe('running')

    // uso único: repetir dá 404
    const de2 = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(de2.status).toBe(404)
  })

  it('execute revalida na rota: se a pessoa já abriu apontamento entre propor e aprovar, recusa (409)', async () => {
    setClient(fakeClientOnce({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_criar_apontamento', arguments: JSON.stringify({ projeto: 'Projeto Y' }) } }],
    }))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'começa meu timer' })
    const prop = (await readSse(chat)).find((e) => e.type === 'proposal')

    // Estado muda entre propor e aprovar: abre um apontamento por fora.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now(), 'running')`,
      [emp.id, project.id],
    )
    const exec = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(409)
    expect(exec.body.error).toMatch(/já tem um apontamento aberto/i)
  })

  it('usuário errado não executa a proposta de outro (404)', async () => {
    const outro = await makeUser({ role: 'employee' })
    setClient(fakeClientOnce({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_criar_task', arguments: JSON.stringify({ projeto: 'Projeto Y', titulo: 'X' }) } }],
    }))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'cria tarefa' })
    const prop = (await readSse(chat)).find((e) => e.type === 'proposal')

    const exec = await asUser(outro).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(404) // takeProposal nega por userId diferente
  })
```

Lembrete: importe `makeUser` no topo do `route.test.js` se ainda não estiver importado (o arquivo já importa `makeUser, makeProject` — confira `route.test.js:4`).

- [ ] **Step 2: Run them and watch them fail**

Run: `cd src && npx vitest run tests/integration/agent/route.test.js`
Expected: FAIL primeiro — até o Task 3 estar aplicado, `criar_apontamento`/`criar_task` não roteiam (400). Com o Task 3 no lugar, estes três casos exercitam revalidação/uso único/usuário errado e passam.

- [ ] **Step 3: Implement**

Nenhum código de produção novo: o comportamento já vem do `agent.js` (`takeProposal` uso único e mesmo-usuário, `execute` no 409, `auditAgentAction`) e das tools dos Tasks 1–2. Se algum caso falhar, corrija a **tool** (a revalidação de estado é dela), não a rota.

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tests/integration/agent/route.test.js
git commit -m "test(agente): fluxo de confirmacao na rota para criar_apontamento/criar_task (revalida, uso unico, usuario errado)"
```

---

## Task 6: Eval set (§13) + rodar a suíte completa

Casos do §13 para escrita: escolher a tool certa, **exigir confirmação** e **não afirmar feito antes do execute**.

**Files:**
- Modify: `src/lib/agent/evals/cases.js`
- (Verificação) toda a suíte.

- [ ] **Step 1: Ampliar os casos**

Em `src/lib/agent/evals/cases.js`, adicione ao array `CASES`:

```javascript
  { nome: 'iniciar apontamento (colaborador)', papel: 'employee', pergunta: 'começa meu timer no projeto Acme', espera: { toolEsperada: 'propor_criar_apontamento', exigirConfirmacao: true, naoAfirmarFeito: true } },
  { nome: 'criar tarefa (colaborador)', papel: 'employee', pergunta: 'cria uma tarefa "revisar briefing" no projeto Acme', espera: { toolEsperada: 'propor_criar_task', exigirConfirmacao: true, naoAfirmarFeito: true } },
  { nome: 'não afirmar feito antes de executar', papel: 'employee', pergunta: 'já pode iniciar meu apontamento no Acme?', espera: { toolEsperada: 'propor_criar_apontamento', naoAfirmarFeito: true } },
```

As chaves `exigirConfirmacao` e `naoAfirmarFeito` são descritivas do §13; o runner de eval (`lib/agent/evals/run.js`) as consome como as demais (`toolEsperada`, `pedirEsclarecimento`, `naoInventar`).

- [ ] **Step 2: Rodar a suíte inteira do backend (nada regrediu)**

Run: `cd src && npm test`
Expected: tudo verde — M1/M2, os novos integração do M4 (criarApontamento, criarTask), route.test ampliado e os unit ampliados. (Integração exige o Postgres de teste — ver abaixo.)

- [ ] **Step 3 (opcional, exige chave real): rodar o eval contra o modelo**

Run: `cd src && npm run test:evals`
Expected: relatório de acerto de tool por caso, incluindo os de escrita. Mede se o modelo escolhe `propor_*` e não afirma "feito" antes da confirmação. Não bloqueia — é medição, não CI.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/evals/cases.js
git commit -m "feat(agente): eval set cobre as tools de escrita (exigir confirmacao, nao afirmar feito) (§13)"
```

---

## Self-Review

**1. Cobertura (design §8.3/§10 → task):**

| Item do design | Task |
|---|---|
| `propor_criar_apontamento` (§8.3) | Task 1 |
| `propor_criar_task` (§8.3) | Task 2 |
| Registrar em registry **e** `WRITE_TOOLS` + roteamento por `kind` | Task 3 |
| Descoberta por papel via `dominio/` (§5) | Task 4 |
| Fluxo de confirmação: propor → revalidar → executar → auditar; uso único; usuário errado (§10, §18) | Task 5 |
| Expiração da proposta (§10) | Coberta em `proposals.test.js:20` (TTL, `now` injetável) — vale p/ qualquer `kind` |
| Eval set: exigir confirmação, não afirmar feito (§13) | Task 6 |

**2. Invariantes, ponto a ponto:**
- **Paridade de escrita.** As duas tools espelham endpoints `requireAuth` liberados a todos (`timeEntries.js:109`, `projectManagement.js:18,31`); `roles` = os quatro papéis; nada de novo liberado. A resolução de projeto por nome resolve para um `project_id` que a pessoa já alcançaria — não amplia alcance.
- **Propor × executar.** `propose` só faz `SELECT` (resolver projeto, checar estado) e monta a proposta — os testes "propose NÃO muta" (Tasks 1 e 2) provam que nada é inserido. Só `execute` faz `INSERT`.
- **Revalidação no execute.** `criar_apontamento` re-checa apontamento aberto + férias de hoje (testes de revalidação, Task 1) e tem backstop do índice único; `criar_task` re-checa existência do projeto (Task 2). Como os endpoints são `requireAuth` para todos, **não há gate de papel a reabrir** — registrado na Nota 3; uma tool futura que espelhe endpoint com guard por papel deverá re-checar o papel no `execute`.
- **Auditoria.** O `execute` roteado pela rota passa por `auditAgentAction` (`agent.js:64`), inalterado; o teste de rota (Task 5) exercita o caminho auditado.
- **Nunca relatar feito antes do execute.** Reforçado no `core.md` (Task 4) e no eval set (Task 6, `naoAfirmarFeito`).

**3. Consistência de tipos/nomes:**
- Shape `{ kind:'write', espelha, roles, definition, propose, execute }` idêntico ao `proporEncerrarApontamento.js`, consumido por `loop.js`/`agent.js` sem mudança.
- `propose → { kind, payload, descricao, dados }` e `execute → { before, after }` — contratos do `loop.js:41` e `agent.js:63`.
- Nomes de tool (`propor_criar_apontamento`, `propor_criar_task`) e de `kind` (`criar_apontamento`, `criar_task`) idênticos entre `definition`, `registry` (Task 3), `WRITE_TOOLS` (Task 3), `dominio/` (Task 4) e eval set (Task 6).
- Colunas dos INSERTs conferidas contra as migrations: `time_entries(user_id, project_id, started_at, status)` (`006:1-15`), `tasks(project_id, title, priority::task_priority, position, created_by)` (`012:18-31` + `013:9`).

**4. Deixado de fora, de propósito (registrado):**
- Outras ações de escrita — pedir férias (`POST /vacation-requests`), lançar despesa, aprovar solicitação, apontamento retroativo do admin (`POST /admin/time-entries`, `requireAdmin`) — ficam para um **M5**. Todas têm guard por papel mais estreito e exigem re-checagem de papel no `execute` (Nota 3); entram pelo mesmo padrão sem tocar no núcleo.
- Resolução de **responsável (assignee) por nome** na `criar_task` — o endpoint aceita `assignee_id`, mas resolver pessoa por nome é escopo extra; a tarefa nasce sem responsável (como quando o campo é omitido na rota). Fica para o M5.
- **Placeholder scan:** todo step traz código real + comando de teste com resultado esperado. Nenhum "TBD/TODO".

**Pré-requisitos de ambiente:** os testes de integração (Tasks 1, 2, 3, 5) exigem o Postgres de teste — rode com `cd src && npm run test:docker` (ver memória "Test DB port conflict": se a 5432 estiver ocupada por `utility-belt-db-1`, suba o Postgres de teste na 5433). Unit (Tasks 3-registry, 4) rodam sem banco. **Nenhuma migration nova, nenhum secret novo — o M4 é só código** (tabelas `time_entries` e `tasks` já existem).
