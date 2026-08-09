# Agente de Gestão — Fase 1, Milestone 3 (Mais tools de leitura curadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o restante das tools de leitura curadas do §8.1 do design — **simulação de performance**, **status de projeto** e **andamento de projeto (o que mexeu na semana)** — reusando exatamente o padrão provado no M2 (tool tipada → query → paridade com o endpoint espelhado). E aplicar de novo o rigor do "corte da margem": a candidata `projecao_estouro` é **cortada**, porque a verificação de schema mostra que não existe fonte de orçamento de horas por projeto — o dado é morto, igual à receita da margem.

**Architecture:** Cada tool é um objeto `{ kind:'read', espelha, roles, definition, run }` em `src/lib/agent/tools/read/`, registrado no `registry.js` filtrado por papel. As três tools deste M3 espelham rotas `requireAuth` que **não recortam por papel** (`GET /me/simulation`, `GET /projects`, `GET /tasks/counts`, `GET /tasks`) → são de **todos os papéis**. A `simulacao_performance` tem um detalhe: o endpoint que ela espelha (`me.js:498`) devolve **os dados do próprio usuário** (`req.profile.id`), então a tool também filtra por `profile.id` **dentro do `run`** — o recorte é por linha na query, não por papel no registry. O núcleo (loop, cliente, sessão, propostas, rota, `format.js`, `scope.js`) não muda.

**Tech Stack:** Node/Express 5 (ESM), Postgres (`pg`), `openai` (npm, endpoint OpenAI-compatible da NVIDIA), Vitest + Supertest.

**Origem:** design em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` (§8.1) e o plano do M2 em `docs/superpowers/plans/2026-08-09-agente-gestao-fase1-m2-tools-leitura.md`.

> **Notas de escopo (2026-08-09), decididas ao escrever este plano contra o código:**
> 1. **`projecao_estouro` é cortada** (Task 4). Verifiquei o schema: `projects` (migration `004_projects.sql`: `name, client, status, image_url, sale_value, deleted_at`; `018_project_client_address_startdate.sql` acrescenta `client_id, address, start_date`) **não tem coluna de orçamento de horas**. `tasks` (`012_project_management.sql`: `due_date, position`; `013_task_collaboration.sql` acrescenta `priority`) **não tem estimativa nem orçamento**. `performance_simulations` (`029_performance_simulations.sql`) guarda minutos **planejados por usuário por mês**, num jsonb — **não** é um orçamento de horas por projeto. Um `grep -riE 'budget|estimat|orcament|hours_|horas_'` em `src/migrations/` não achou nenhuma coluna — só um comentário "prazo" em `012`. Sem orçamento de horas, "quando o orçamento estoura" não tem denominador: é exatamente o caso da margem (§8.1), e sai pelo mesmo motivo. O pré-requisito de produto fica no backlog (§ final).
> 2. **`horas_por_projeto` e `apontamentos_abertos` (§8.1) não entram como tools novas neste M3.** `horas_por_projeto` já foi absorvido no `custo_por_projeto`/`status_projeto` (ambos devolvem horas por projeto — DRY, mesma decisão do M2). `apontamentos_abertos` é operacional de timer, fora do foco deste lote de leitura de gestão; fica registrado no backlog.
> 3. **`scope.js` NÃO é expandido neste M3.** Nenhuma das três tools tem coluna sensível que varie por papel: `status_projeto` e `andamento_de_projeto` espelham `requireAuth` sem recorte, e `simulacao_performance` recorta por **linha** (`user_id = profile.id`) dentro do `run`, não por coluna por papel. Expandir `scope.js` agora seria YAGNI — mesma conclusão do M2.

---

## Global Constraints

Herdadas do esqueleto (M1) e do M2. Todo task as respeita.

- **Modelo/provedor real:** endpoint OpenAI-compatible da **NVIDIA** (`https://integrate.api.nvidia.com/v1`), modelo **`deepseek-ai/deepseek-v4-flash-0731`** (default fixado no M2, Task 1). Configurável por env; override por requisição continua valendo.
- **RBAC de quem perguntou.** Toda tool roda sob `req.profile`. As três tools deste M3 são de todos os papéis; `simulacao_performance` filtra por `profile.id` na query (dado próprio, paridade com `me.js:498`).
- **Paridade de alcance.** Cada tool declara o endpoint que espelha e não amplia alcance. Nenhuma expõe linha/coluna que o papel não alcançaria pelo site.
- **Modelo nunca é a fonte da verdade.** Todo dado vem de query; o modelo só redige. Horas reais vêm sempre vivas de `time_entries`, nunca de `performance_simulations`.
- **Localização:** fuso `America/Sao_Paulo`, R$ pt-BR, datas `dd/mm/aaaa` — via `format.js` (`resolvePeriodo`/`formatDateBR`, já existem).
- **Auditoria:** toda leitura de tool passa por `auditAgentRead` (já cabeado no `loop.js`).
- **Rigor de dado morto (precedente da margem, §8.1):** nenhuma tool é escrita sobre coluna que nasce zerada e nunca recebe UPDATE. `projecao_estouro` cai por isso (Task 4).
- **Estilo:** ESM, comentários pt-BR na densidade dos arquivos vizinhos, sem TypeScript. Testes com Vitest/Supertest, factories de `src/tests/helpers/`.

---

## File Structure

**Novas tools (`src/lib/agent/tools/read/`)**
- `simulacaoPerformance.js` — todos os papéis (dado próprio) — espelha `GET /me/simulation`.
- `statusProjeto.js` — todos os papéis — espelha `GET /projects` + `GET /tasks/counts`.
- `andamentoDeProjeto.js` — todos os papéis — espelha `GET /tasks` (dados de colaboração da tarefa).

**Modificados**
- `src/lib/agent/tools/registry.js` — registrar as 3 tools.
- `src/lib/agent/context/dominio/core.md` — descrever as tabelas/tools novas (as três são de todos os papéis → núcleo comum).
- `src/lib/agent/evals/cases.js` — casos novos.
- `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — riscar `projecao_estouro` no §8.1 com a evidência de schema (Task 4).

**Testes**
- Integração: `src/tests/integration/agent/simulacaoPerformance.test.js`, `statusProjeto.test.js`, `andamentoDeProjeto.test.js`.
- Unit: `src/tests/unit/agent/registry.test.js` (ampliar), `src/tests/unit/agent/prompt.test.js` (ampliar).

---

## Task 1: Tool `simulacao_performance` (todos os papéis, dado próprio) — espelha `GET /me/simulation`

`GET /me/simulation` (`src/routes/me.js:498`) é `requireAuth` e lê **os dados do próprio usuário** (`WHERE user_id = $1`, com `$1 = req.profile.id`, `me.js:503-505`). A tabela `performance_simulations` (`029_performance_simulations.sql`: PK `(user_id, ym)`, coluna `planned jsonb`) guarda as horas **planejadas** do mês; as horas **reais** vêm sempre vivas de `time_entries`. Logo a tool é de todos os papéis, mas recorta por **linha** (`user_id = profile.id`) dentro do `run` — cada pessoa só vê a própria simulação, igual ao endpoint.

**Files:**
- Create: `src/lib/agent/tools/read/simulacaoPerformance.js`
- Test: `src/tests/integration/agent/simulacaoPerformance.test.js`

**Interfaces:**
- Consumes: `../../format.js` (`resolvePeriodo`), `../../../db.js` (`query`).
- Produces: default export `{ kind:'read', espelha:'GET /me/simulation', roles:[todos], definition, run(profile, args) }`.
  - `definition.function.name = 'simulacao_performance'`, `parameters`: `{ mes?: 'YYYY-MM' }` (default: mês atual).
  - `run(profile, { mes }) → { data: { mes, meta_ganho, horas_planejadas, horas_realizadas, tem_simulacao }, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/simulacaoPerformance.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/simulacaoPerformance.js'

// YYYY-MM do mês atual no fuso do estúdio — casa com o default da tool.
function ymAtual() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(new Date())
}

describe('tool simulacao_performance (todos os papéis, dado próprio)', () => {
  let ana, bruno, proj, ym
  beforeEach(async () => {
    await resetDb()
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    ym = ymAtual()
    // Ana: planejou 600 min (10h) para o mês e já apontou 180 min (3h) concluídos.
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [ana.id, ym, JSON.stringify({ target_amount: 5000, overrides: { [`${ym}-15`]: 600 } })],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', 180, 0)`,
      [ana.id, proj.id],
    )
    // Bruno tem a própria simulação — não deve vazar para a da Ana.
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [bruno.id, ym, JSON.stringify({ target_amount: 9999, overrides: { [`${ym}-10`]: 120 } })],
    )
  })

  it('devolve a simulação do PRÓPRIO usuário: meta, horas planejadas e horas reais', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.mes).toBe(ym)
    expect(data.meta_ganho).toBe(5000)
    expect(data.horas_planejadas).toBe(10)
    expect(data.horas_realizadas).toBe(3)
    expect(data.tem_simulacao).toBe(true)
  })

  it('não vaza a simulação de outra pessoa', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.meta_ganho).not.toBe(9999)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/simulacaoPerformance.test.js`
Expected: FAIL — módulo inexistente. (Exige o Postgres de teste de pé.)

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/simulacaoPerformance.js
// Espelha GET /me/simulation (me.js:498, requireAuth, dado PRÓPRIO): lê a simulação
// de performance do mês do próprio usuário (horas PLANEJADAS, em
// performance_simulations) e cruza com as horas REAIS, que vêm sempre vivas de
// time_entries — nunca da tabela de simulação. Cada pessoa só vê a própria
// simulação: o recorte é por linha (user_id = profile.id), igual ao endpoint.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const YM_RE = /^\d{4}-\d{2}$/

const definition = {
  type: 'function',
  function: {
    name: 'simulacao_performance',
    description: 'Sua simulação de performance do mês: meta de ganho, horas planejadas e horas já realizadas. É sempre a SUA simulação — não dá para ver a de outra pessoa.',
    parameters: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'mês no formato YYYY-MM; padrão é o mês atual' } },
      additionalProperties: false,
    },
  },
}

// Soma os minutos planejados do mapa `overrides` do jsonb salvo. Robusto a
// formato ausente/antigo — cai em zero em vez de estourar.
function planejadoMinutos(planned) {
  const p = planned && typeof planned === 'object' ? planned : {}
  const overrides = p.overrides && typeof p.overrides === 'object' ? p.overrides : {}
  let soma = 0
  for (const v of Object.values(overrides)) if (Number.isFinite(v)) soma += v
  return soma
}

async function run(profile, args) {
  const mes = YM_RE.test(String(args?.mes || '')) ? args.mes : resolvePeriodo('mes').inicio.slice(0, 7)
  const inicio = `${mes}-01`
  // Dia 0 do mês seguinte (0-based) = último dia do mês alvo.
  const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)

  const sim = await query(
    'SELECT planned FROM performance_simulations WHERE user_id = $1 AND ym = $2',
    [profile.id, mes],
  )
  const planned = sim.rows[0]?.planned || null

  const real = await query(
    `SELECT COALESCE(SUM(duration_minutes),0)::int AS minutos
       FROM time_entries
      WHERE user_id = $1 AND status = 'completed'
        AND started_at >= $2::date AND started_at < ($3::date + interval '1 day')`,
    [profile.id, inicio, fim],
  )

  const data = {
    mes,
    meta_ganho: planned ? Number(planned.target_amount || 0) : 0,
    horas_planejadas: Number((planejadoMinutos(planned) / 60).toFixed(2)),
    horas_realizadas: Number((real.rows[0].minutos / 60).toFixed(2)),
    tem_simulacao: planned != null,
  }
  return { data, count: 1 }
}

export default {
  kind: 'read', espelha: 'GET /me/simulation',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/simulacaoPerformance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/simulacaoPerformance.js src/tests/integration/agent/simulacaoPerformance.test.js
git commit -m "feat(agente): tool simulacao_performance (todos os papeis, dado proprio, espelha GET /me/simulation)"
```

---

## Task 2: Tool `status_projeto` (todos os papéis) — espelha `GET /projects` + `GET /tasks/counts`

`GET /projects` (`src/routes/projects.js:30`) e `GET /tasks/counts` (`src/routes/projectManagement.js:145`) são ambos `requireAuth` **sem recorte por papel** — devolvem todas as linhas a qualquer autenticado. A tool junta as duas visões num retrato de projeto: status (o enum `project_status` só tem **dois** valores — `active` e `completed`, `002_enums.sql:6`), contagem de tarefas por coluna do kanban e horas apontadas.

> **Cuidado de query (fan-out):** juntar `tasks` **e** `time_entries` no mesmo `GROUP BY` multiplica linhas (produto cartesiano por projeto) e corrompe tanto as contagens quanto a soma de horas. A query usa `LEFT JOIN LATERAL` para agregar cada lado isoladamente — é o mesmo padrão que o próprio `GET /tasks` já usa (`projectManagement.js:113-131`).

**Files:**
- Create: `src/lib/agent/tools/read/statusProjeto.js`
- Test: `src/tests/integration/agent/statusProjeto.test.js`

**Interfaces:**
- Consumes: `../../../db.js` (`query`).
- Produces: `{ kind:'read', espelha:'GET /projects + GET /tasks/counts', roles:[todos], definition, run }`.
  - name `status_projeto`, params `{ projeto_id?: string }` (se omitido, traz todos os projetos ativos).
  - `run(profile, { projeto_id }) → { data: Array<{ projeto, cliente, status, tarefas:{todo,in_progress,in_review,done,abandoned,total}, total_horas }>, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/statusProjeto.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/statusProjeto.js'

async function makeTask({ project_id, title, status }) {
  await query(
    `INSERT INTO tasks (project_id, title, status, position) VALUES ($1,$2,$3,0)`,
    [project_id, title, status],
  )
}

describe('tool status_projeto (todos os papéis)', () => {
  let emp, proj
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    proj = await makeProject({ name: 'Projeto A', status: 'active' })
    await makeTask({ project_id: proj.id, title: 'T1', status: 'todo' })
    await makeTask({ project_id: proj.id, title: 'T2', status: 'in_review' })
    await makeTask({ project_id: proj.id, title: 'T3', status: 'done' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 120, 0)`,
      [emp.id, proj.id],
    )
  })

  it('retrata o projeto: status, tarefas por coluna e horas apontadas', async () => {
    const { data } = await tool.run(emp, { projeto_id: proj.id })
    expect(data).toHaveLength(1)
    const p = data[0]
    expect(p.projeto).toBe('Projeto A')
    expect(p.status).toBe('active')
    expect(p.tarefas.todo).toBe(1)
    expect(p.tarefas.in_review).toBe(1)
    expect(p.tarefas.done).toBe(1)
    expect(p.tarefas.total).toBe(3)
    expect(p.total_horas).toBe(2) // 120 min, sem inflar por causa das 3 tarefas
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/statusProjeto.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/statusProjeto.js
// Espelha GET /projects (projects.js:30, requireAuth) + GET /tasks/counts
// (projectManagement.js:145, requireAuth) — ambos sem recorte por papel. Retrato
// de um projeto (ou de todos os ativos): status, tarefas por coluna do kanban e
// horas apontadas. project_status só tem dois valores (002_enums.sql): 'active'
// e 'completed'. LATERAL para não inflar horas/contagens (fan-out).
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'status_projeto',
    description: 'Retrato de um projeto (ou de todos os ativos): status (active/completed), tarefas por coluna do kanban (todo, in_progress, in_review, done, abandoned) e horas já apontadas. Passe projeto_id para um projeto específico.',
    parameters: {
      type: 'object',
      properties: { projeto_id: { type: 'string', description: 'id do projeto; se omitido, traz todos os projetos ativos' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const id = args?.projeto_id || null
  const { rows } = await query(
    `SELECT p.name AS projeto, COALESCE(c.name, p.client) AS cliente, p.status,
            tc.todo, tc.in_progress, tc.in_review, tc.done, tc.abandoned, tc.total_tarefas,
            COALESCE(hc.total_minutes, 0) AS total_minutes
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_tarefas,
                COUNT(*) FILTER (WHERE status = 'todo')::int        AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'in_review')::int   AS in_review,
                COUNT(*) FILTER (WHERE status = 'done')::int        AS done,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int   AS abandoned
           FROM tasks WHERE project_id = p.id
       ) tc ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(duration_minutes),0)::int AS total_minutes
           FROM time_entries WHERE project_id = p.id AND status = 'completed'
       ) hc ON true
      WHERE p.deleted_at IS NULL
        AND ($1::uuid IS NULL OR p.id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR p.status = 'active')
      ORDER BY p.name`,
    [id],
  )
  const data = rows.map((r) => ({
    projeto: r.projeto,
    cliente: r.cliente || null,
    status: r.status,
    tarefas: {
      todo: r.todo, in_progress: r.in_progress, in_review: r.in_review,
      done: r.done, abandoned: r.abandoned, total: r.total_tarefas,
    },
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
  }))
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /projects + GET /tasks/counts',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/statusProjeto.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/statusProjeto.js src/tests/integration/agent/statusProjeto.test.js
git commit -m "feat(agente): tool status_projeto (todos os papeis, retrato de projeto)"
```

---

## Task 3: Tool `andamento_de_projeto` (todos os papéis) — espelha `GET /tasks`

O que mudou num projeto no período: comentários novos (`task_comments`, `013_task_collaboration.sql:12`), anexos novos (`task_attachments`, `013:43` + `comment_id` em `014_task_attachment_comment.sql`) e atividade das tarefas (`task_activity`, `013:66` — colunas `task_id, actor_id, type, detail jsonb, created_at`, alimentada por `logActivity` em `src/lib/taskActivity.js:6`). Todas essas linhas são alcançáveis por qualquer autenticado via `GET /tasks`/detalhe de tarefa (`projectManagement.js:80`/`:204`, `requireAuth`, sem recorte). A tool junta e conta por projeto no período.

**Files:**
- Create: `src/lib/agent/tools/read/andamentoDeProjeto.js`
- Test: `src/tests/integration/agent/andamentoDeProjeto.test.js`

**Interfaces:**
- Consumes: `../../format.js` (`resolvePeriodo`), `../../../db.js`.
- Produces: `{ kind:'read', espelha:'GET /tasks', roles:[todos], definition, run }`.
  - name `andamento_de_projeto`, params `{ projeto_id (obrigatório), periodo?: 'hoje'|'semana'|'mes' }` (default `semana`).
  - `run(profile, { projeto_id, periodo }) → { data: { projeto_id, periodo:{inicio,fim}, novos_comentarios, novos_anexos, atividades, itens: Array<{ tarefa, tipo, quando }> }, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/andamentoDeProjeto.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/andamentoDeProjeto.js'

describe('tool andamento_de_projeto (todos os papéis)', () => {
  let ana, proj, taskId
  beforeEach(async () => {
    await resetDb()
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    proj = await makeProject({ name: 'P' })
    const t = await query(
      `INSERT INTO tasks (project_id, title, status, position) VALUES ($1,'Tarefa X','in_progress',0) RETURNING id`,
      [proj.id],
    )
    taskId = t.rows[0].id
    // Tudo com now() → cai na semana corrente.
    await query(
      `INSERT INTO task_comments (task_id, author_id, body) VALUES ($1,$2,'oi')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_attachments (task_id, uploaded_by, file_url, file_name) VALUES ($1,$2,'u','f.png')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_activity (task_id, actor_id, type, detail) VALUES ($1,$2,'status_change','{}'::jsonb)`,
      [taskId, ana.id],
    )
  })

  it('conta comentários, anexos e atividade da semana e lista os itens de atividade', async () => {
    const { data } = await tool.run(ana, { projeto_id: proj.id, periodo: 'semana' })
    expect(data.novos_comentarios).toBe(1)
    expect(data.novos_anexos).toBe(1)
    expect(data.atividades).toBe(1)
    expect(data.itens[0].tarefa).toBe('Tarefa X')
    expect(data.itens[0].tipo).toBe('status_change')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/andamentoDeProjeto.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/andamentoDeProjeto.js
// Espelha o alcance de GET /tasks e do detalhe de tarefa (projectManagement.js:80/204,
// requireAuth, sem recorte por papel): o que mexeu num projeto no período —
// comentários novos (task_comments), anexos novos (task_attachments) e atividade
// das tarefas (task_activity, alimentada por logActivity em taskActivity.js:6).
// Três agregações separadas: são tabelas distintas, não um único endpoint.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'andamento_de_projeto',
    description: 'O que mudou num projeto no período: comentários novos, anexos novos e atividade das tarefas (mudanças de status, atribuições). Use para o resumo semanal de um projeto.',
    parameters: {
      type: 'object',
      properties: {
        projeto_id: { type: 'string', description: 'id do projeto' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão semana' },
      },
      required: ['projeto_id'],
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const projetoId = args?.projeto_id
  if (!projetoId) return { data: null, count: 0 }
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'semana')
  const params = [projetoId, inicio, fim]
  const janela = `AND x.created_at >= $2::date AND x.created_at < ($3::date + interval '1 day')`

  const comentarios = await query(
    `SELECT COUNT(*)::int AS n FROM task_comments x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}`,
    params,
  )
  const anexos = await query(
    `SELECT COUNT(*)::int AS n FROM task_attachments x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}`,
    params,
  )
  const atividade = await query(
    `SELECT x.type AS tipo, t.title AS tarefa, x.created_at AS quando
       FROM task_activity x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}
      ORDER BY x.created_at DESC
      LIMIT 20`,
    params,
  )

  const data = {
    projeto_id: projetoId,
    periodo: { inicio, fim },
    novos_comentarios: comentarios.rows[0].n,
    novos_anexos: anexos.rows[0].n,
    atividades: atividade.rows.length,
    itens: atividade.rows.map((r) => ({ tarefa: r.tarefa, tipo: r.tipo, quando: r.quando })),
  }
  return { data, count: atividade.rows.length }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/andamentoDeProjeto.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/andamentoDeProjeto.js src/tests/integration/agent/andamentoDeProjeto.test.js
git commit -m "feat(agente): tool andamento_de_projeto (todos os papeis, resumo semanal do projeto)"
```

---

## Task 4: Cortar `projecao_estouro` do design (§8.1) — precedente da margem

A candidata `projecao_estouro(projeto_id)` prometia "no ritmo atual, quando o orçamento de **horas** estoura". A verificação de schema mostra que **não existe orçamento de horas por projeto** — o denominador não existe, exatamente como a receita da margem (§8.1). O honesto é riscar a tool no design, com a evidência, em vez de inventar um orçamento. É documentação: não há código nem teste.

**Evidência (citada no design):**
- `projects` — `004_projects.sql`: `name, client, status, image_url, sale_value, deleted_at`; `018_project_client_address_startdate.sql`: `client_id, address, start_date`. **Nenhuma coluna de horas orçadas.**
- `tasks` — `012_project_management.sql`: `due_date, position`; `013_task_collaboration.sql`: `priority`. **Nenhuma estimativa/orçamento de horas.**
- `performance_simulations` — `029_performance_simulations.sql`: minutos **planejados por usuário por mês** (jsonb `planned`), **não** um orçamento de horas por projeto.
- `grep -riE 'budget|estimat|orcament|hours_|horas_' src/migrations/` → nenhuma coluna (só um comentário "prazo" em `012`).

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`

- [ ] **Step 1: Riscar a tool no §8.1**

Em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`, no §8.1, troque a linha:

```markdown
- `projecao_estouro(projeto_id)` — no ritmo atual, quando o orçamento de horas estoura.
  Sobrevive à decisão de 2026-08-08: é orçamento de **horas**, não depende de dinheiro.
```

por:

```markdown
- ~~`projecao_estouro(projeto_id)` — no ritmo atual, quando o orçamento de horas estoura.~~
  **Fora da Fase 1 (2026-08-09, M3)** — mesmo motivo da margem: o dado é morto. Verificado
  contra o schema: `projects` (`004`/`018`) e `tasks` (`012`/`013`) não têm coluna de
  orçamento/estimativa de horas, e `performance_simulations` (`029`) guarda minutos
  planejados **por usuário por mês**, não um orçamento **por projeto**. Sem denominador, "quando
  estoura" não é calculável — e uma tool que devolvesse um número aqui repassaria uma
  projeção sem base, que as camadas do §9 não pegam (a origem seria a tool, como na margem).
  Pré-requisito de produto no §20.
```

- [ ] **Step 2: Registrar o pré-requisito de produto no §20**

No §20 (backlog), no bloco "Pré-requisitos de dado", acrescente:

```markdown
- **Orçamento de horas por projeto** *(2026-08-09, ver §8.1)* — pré-requisito de
  `projecao_estouro`. Hoje não há coluna de horas orçadas em `projects` nem estimativa em
  `tasks`; `performance_simulations` é planejamento por usuário, não por projeto. Com uma
  coluna de orçamento (ou soma de estimativas de tarefa) a tool entra depois sem tocar no
  núcleo. **Decisão de produto, não do agente.**
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "docs: corta projecao_estouro (sem orcamento de horas no schema); precedente da margem"
```

---

## Task 5: Registrar as 3 tools no `registry.js`

**Files:**
- Modify: `src/lib/agent/tools/registry.js`
- Test: `src/tests/unit/agent/registry.test.js` (ampliar)

**Interfaces:** `buildRegistry(profile)` inalterado; só cresce a lista `TODAS`.

> As três tools são de **todos os papéis**, então a paridade testada aqui é a **inclusão** em qualquer papel (não a exclusão como no M2). O recorte da `simulacao_performance` é por linha, dentro do `run` (Task 1), não pelo registry — por isso ela aparece para todos, mas cada um só vê a própria simulação.

- [ ] **Step 1: Write the failing test**

Acrescente ao `src/tests/unit/agent/registry.test.js`:

```javascript
describe('registry — tools do M3 (todos os papéis)', () => {
  const M3 = ['simulacao_performance', 'status_projeto', 'andamento_de_projeto']

  it('admin recebe as tools do M3', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    for (const n of M3) expect(nomes).toContain(n)
  })

  it('colaborador também recebe as três (são de todos os papéis)', () => {
    const nomes = buildRegistry({ role: 'employee' }).definitions.map((d) => d.function.name)
    for (const n of M3) expect(nomes).toContain(n)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: FAIL — as tools novas ainda não estão no registry.

- [ ] **Step 3: Implement — registrar as tools**

Em `src/lib/agent/tools/registry.js`, adicione os imports e inclua na lista `TODAS`:

```javascript
import simulacaoPerformance from './read/simulacaoPerformance.js'
import statusProjeto from './read/statusProjeto.js'
import andamentoDeProjeto from './read/andamentoDeProjeto.js'
```

E acrescente à lista `TODAS` (após as tools do M2):

```javascript
const TODAS = [
  listarEquipe, proporEncerrarApontamento,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  simulacaoPerformance, statusProjeto, andamentoDeProjeto,
]
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: PASS (os grupos do M1/M2 + o novo grupo do M3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/registry.js src/tests/unit/agent/registry.test.js
git commit -m "feat(agente): registra as 3 tools de leitura do M3 no registry"
```

---

## Task 6: Domínio (`dominio/core.md`) descreve as tabelas e tools novas

As três tools são de todos os papéis → entram no **núcleo comum** (`core.md`), não numa fatia por papel. Sem isso o modelo não sabe que pode pedir simulação/status/andamento.

**Files:**
- Modify: `src/lib/agent/context/dominio/core.md`
- Test: `src/tests/unit/agent/prompt.test.js` (ampliar)

- [ ] **Step 1: Write the failing test**

Acrescente em `src/tests/unit/agent/prompt.test.js`:

```javascript
it('domínio (todos) cita status do projeto, andamento e simulação de performance', () => {
  const p = buildSystemPrompt({ role: 'employee' })
  expect(p).toMatch(/status do projeto|retrato do projeto/i)
  expect(p).toMatch(/andamento do projeto|o que mudou no projeto/i)
  expect(p).toMatch(/simulação de performance|horas planejadas/i)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: FAIL — os termos ainda não estão no `core.md`.

- [ ] **Step 3: Implement — ampliar o `core.md`**

Adicione ao fim de `src/lib/agent/context/dominio/core.md`:

```markdown

## Colaboração e planejamento
- **task_comments / task_attachments / task_activity** — comentários, anexos e histórico
  de atividade das tarefas (mudanças de status, atribuições).
- **performance_simulations** — a simulação de performance de cada pessoa por mês (meta de
  ganho e horas planejadas). É sempre a simulação da própria pessoa.

## O que você pode pedir (todos)
- **status do projeto**: retrato de um projeto — status (ativo/concluído), tarefas por
  coluna do kanban e horas apontadas.
- **andamento do projeto**: o que mudou num projeto no período — comentários e anexos novos
  e atividade das tarefas. Bom para o resumo semanal.
- **simulação de performance**: sua meta do mês, horas planejadas e horas já realizadas
  (as reais vêm sempre de time_entries, nunca da simulação).
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: PASS (as asserções do M2 + a nova do M3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context/dominio/core.md src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): dominio descreve status/andamento de projeto e simulacao (§5)"
```

---

## Task 7: Crescer o eval set + rodar a suíte completa

**Files:**
- Modify: `src/lib/agent/evals/cases.js`
- (Verificação) toda a suíte.

- [ ] **Step 1: Ampliar os casos**

Em `src/lib/agent/evals/cases.js`, adicione ao array `CASES`:

```javascript
  { nome: 'status do projeto (colaborador)', papel: 'employee', pergunta: 'como está o projeto Alpha? quantas tarefas em revisão?', espera: { toolEsperada: 'status_projeto' } },
  { nome: 'andamento do projeto (admin)', papel: 'admin', pergunta: 'o que mudou no projeto Alpha essa semana?', espera: { toolEsperada: 'andamento_de_projeto' } },
  { nome: 'minha simulação (colaborador)', papel: 'employee', pergunta: 'quantas horas eu planejei esse mês e quanto já fiz?', espera: { toolEsperada: 'simulacao_performance' } },
```

- [ ] **Step 2: Rodar a suíte inteira do backend (nada regrediu)**

Run: `cd src && npm test`
Expected: tudo verde — os testes do M1/M2, os 3 novos de integração do M3 e os unit ampliados (registry, prompt).

> **Nota de ambiente (memória do projeto):** o `test:docker` pode quebrar na porta 5432 se o `utility-belt-db-1` estiver de pé; o contorno é subir o Postgres de teste na 5433. Ver `test-db-port-conflict.md`.

- [ ] **Step 3 (opcional, exige chave real): rodar o eval contra o modelo**

Run: `cd src && npm run test:evals`
Expected: relatório de acerto de tool por caso, incluindo os três novos. Medição, não CI.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/evals/cases.js
git commit -m "feat(agente): eval set cobre status/andamento de projeto e simulacao (§13)"
```

---

## Self-Review

**1. Cobertura (design §8.1 → task):**

| Item do design §8.1 | Decisão |
|---|---|
| `simulacao_performance` | Task 1 — todos os papéis, dado próprio (espelha `GET /me/simulation`) |
| `status_projeto(projeto_id)` | Task 2 — todos os papéis (espelha `GET /projects` + `GET /tasks/counts`) |
| `andamento_de_projeto` (comments/tasks/attachments) | Task 3 — todos os papéis (espelha `GET /tasks`) |
| `projecao_estouro(projeto_id)` | **Cortada** — Task 4 (sem orçamento de horas no schema; precedente da margem) |
| `horas_por_projeto` | Absorvido em `custo_por_projeto` (M2) / `status_projeto` (Task 2) — DRY |
| `apontamentos_abertos` | Backlog (operacional de timer, fora do foco de leitura de gestão) |
| catálogo por papel (§8) | Task 5 (registry) |
| `dominio/` (§5) | Task 6 (núcleo comum — as três são de todos os papéis) |
| eval set (§13) | Task 7 |

**Cortado deste milestone, de propósito (registrado):**
- **`projecao_estouro`** — dado morto. `projects` (`004`/`018`) e `tasks` (`012`/`013`) não têm coluna de orçamento/estimativa de horas; `performance_simulations` (`029`) é planejamento **por usuário**, não **por projeto**; `grep` em `src/migrations/` não achou nenhuma coluna de orçamento. Pré-requisito de produto (coluna de orçamento de horas por projeto) fica no §20 do design (Task 4, Step 2). **Não se inventou um orçamento.**
- **Expansão do `scope.js`** — nenhuma tool do M3 tem coluna sensível que varie por papel; `simulacao_performance` recorta por **linha** no `run`. YAGNI, mesma conclusão do M2.
- **`apontamentos_abertos`**, tool de SQL restrito (§8.2), tools de escrita novas, widget/feature flag — milestones seguintes.

**2. Placeholder scan:** todo step traz código real + comando de teste com resultado esperado. Nenhum "TBD/TODO".

**3. Consistência de tipos/nomes:**
- Toda tool segue o shape `{ kind:'read', espelha, roles, definition, run }` — igual ao M1/M2 e consumido pelo `registry`/`loop` sem mudança.
- `resolvePeriodo(nome) → { inicio, fim }` (de `format.js`) consumido nas Tasks 1 e 3; `resolvePeriodo('mes').inicio.slice(0,7)` deriva o YM atual na Task 1.
- `run(profile, args) → { data, count }` — o `loop.js` já serializa `data` e audita `count`; nada muda no núcleo. `andamento_de_projeto` devolve `data` como objeto (não array) — igual ao `ferias_e_conflitos` do M2, que já devolve `{ ferias, conflitos }`; o `loop` serializa qualquer JSON.
- Nomes de tool (`simulacao_performance`, `status_projeto`, `andamento_de_projeto`) idênticos entre a `definition`, o `registry` (Task 5), o `core.md` (Task 6) e o eval set (Task 7).

**4. Armadilhas de query cobertas:**
- **Fan-out** em `status_projeto` (Task 2): `LATERAL` separado para contagem de tarefas e soma de horas, senão o produto cartesiano infla os dois. Teste cobre (`total_horas === 2` com 3 tarefas).
- **Vazamento entre usuários** em `simulacao_performance` (Task 1): filtro `user_id = profile.id`; teste com a simulação do Bruro (`9999`) prova que não vaza para a da Ana.
- **Enum real** em `status_projeto`: `project_status` só tem `active`/`completed` (`002_enums.sql:6`) — a descrição da tool não promete estados que o schema não tem.

**Pré-requisitos de ambiente:** os testes de integração (Tasks 1–3) exigem o Postgres de teste (`docker-compose.test.yml`; ver a nota de porta 5433 na Task 7). Unit (Tasks 5, 6) rodam sem banco. Task 4 é só documentação. Nenhuma migration nova, nenhum secret novo — o M3 é só código e um corte no design.
