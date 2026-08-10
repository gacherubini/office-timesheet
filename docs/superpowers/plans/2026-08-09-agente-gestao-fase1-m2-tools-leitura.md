# Agente de Gestão — Fase 1, Milestone 2 (Alargamento das tools de leitura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar o valor de gestão do agente com um lote de tools de leitura curadas — custo por projeto, carga da equipe, quem não apontou, tasks travadas e férias/conflitos — reusando o padrão já provado no esqueleto (tool tipada → `scope`/query → paridade com o endpoint espelhado), e absorver dois aprendizados da ligada ao vivo: reforçar a regra de ambiguidade no prompt e alinhar a config padrão ao provedor real (NVIDIA + DeepSeek V4 Flash).

**Architecture:** Cada tool é um objeto `{ kind:'read', espelha, roles, definition, run }` em `src/lib/agent/tools/read/`, registrado no `registry.js` filtrado por papel. Tools de inteligência (custo, carga, quem-não-apontou) espelham rotas `requireAdmin` de `reports` → **admin-only por construção** (o `registry` barra os demais papéis). Tools operacionais (tasks travadas, férias) espelham rotas `requireAuth` que hoje **não recortam por papel** → devolvem as mesmas linhas a todos. O núcleo (loop, cliente, sessão, propostas, rota) não muda.

**Tech Stack:** Node/Express 5 (ESM), Postgres (`pg`), `openai` (npm, endpoint OpenAI-compatible da NVIDIA), Vitest + Supertest.

**Origem:** design em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` (§8.1) e o esqueleto entregue em `docs/superpowers/plans/2026-08-08-agente-gestao-fase1-esqueleto.md`.

> **Notas de escopo (2026-08-09), decididas ao escrever este plano contra o código:**
> 1. **`scope.js` NÃO é expandido neste M2.** Nenhuma tool aqui tem coluna ou linha sensível que varie por papel: as de inteligência são admin-only (barradas no `registry`), e `/tasks` e `/vacation-calendar` são `requireAuth` **sem** recorte — devolvem tudo a qualquer autenticado (verificado em `projectManagement.js:80` e `vacations.js:120`). Expandir `scope.js` agora seria YAGNI; ele cresce quando aparecer um tool com coluna sensível por papel numa entidade nova.
> 2. **`horas_por_projeto` não vira tool separada:** o `custo_por_projeto` já devolve `total_horas` por projeto. DRY.
> 3. **`carga_equipe` e `quem_nao_apontou` são derivados** (agregam sobre todos os usuários) e não espelham um único endpoint linha-a-linha; o papel mínimo deles é **admin** (território dos relatórios), garantido pelo `registry`. A paridade testada é a exclusão por papel, não igualdade de ids.

---

## Global Constraints

Herdadas do esqueleto (M1). Todo task as respeita.

- **Modelo/provedor real:** endpoint OpenAI-compatible da **NVIDIA** (`https://integrate.api.nvidia.com/v1`), modelo **`deepseek-ai/deepseek-v4-flash-0731`**. Configurável por env; o override por requisição continua valendo. *(Este M2 atualiza o default do código — Task 1.)*
- **RBAC de quem perguntou.** Toda tool roda sob `req.profile`. Tools que espelham `requireAdmin` são admin-only via `registry`.
- **Paridade de alcance.** Cada tool declara o endpoint que espelha e não amplia alcance.
- **Modelo nunca é a fonte da verdade.** Todo dado vem de query; o modelo só redige.
- **Localização:** fuso `America/Sao_Paulo`, R$ pt-BR, datas `dd/mm/aaaa` — via `format.js` (já existe).
- **Auditoria:** toda leitura de tool passa por `auditAgentRead` (já cabeado no `loop.js`).
- **Rótulo honesto (§8.1):** custo de horas é **"custo dos horistas"**, nunca "custo do projeto" — quem tem salário fixo aponta com custo zero.
- **Estilo:** ESM, comentários pt-BR na densidade dos arquivos vizinhos, sem TypeScript. Testes com Vitest/Supertest, factories de `tests/helpers/`.

---

## File Structure

**Novas tools (`src/lib/agent/tools/read/`)**
- `custoPorProjeto.js` — admin — espelha `GET /admin/reports/project-cost`.
- `cargaEquipe.js` — admin — horas + tarefas abertas por pessoa no período.
- `quemNaoApontou.js` — admin — ativos sem apontamento concluído no período.
- `tasksTravadas.js` — todos os papéis — espelha `GET /tasks` (in_review há +N dias ou abandoned).
- `feriasEConflitos.js` — todos os papéis — espelha `GET /vacation-calendar` + detecção de sobreposição.

**Modificados**
- `src/lib/agent/tools/registry.js` — registrar as 5 tools.
- `src/lib/agent/client.js` — default base URL + modelo → NVIDIA/Flash.
- `src/lib/agent/prompt.js` — regra de ambiguidade reforçada.
- `src/lib/agent/context/dominio/core.md`, `admin.md`, `employee.md` — descrever as tabelas/tools novas.
- `src/lib/agent/evals/cases.js` — casos novos.
- `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — nota de config real (§4.1/§5).

**Testes**
- Unit: `tests/unit/agent/registry.test.js` (ampliar), `tests/unit/agent/prompt.test.js` (ampliar).
- Integração: `tests/integration/agent/custoPorProjeto.test.js`, `cargaEquipe.test.js`, `quemNaoApontou.test.js`, `tasksTravadas.test.js`, `feriasEConflitos.test.js`.

---

## Task 1: Config padrão → NVIDIA + DeepSeek V4 Flash

O provedor real é a NVIDIA e o modelo hospedado é o `deepseek-v4-flash-0731` (o `v4-pro`/OpenRouter do design não está disponível na conta). Alinhar o default do código à realidade, mantendo tudo configurável.

**Files:**
- Modify: `src/lib/agent/client.js`
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`
- Test: `src/tests/unit/agent/client.test.js` (ampliar)

**Interfaces:** sem mudança de assinatura — só os defaults de `AGENT_PROVIDER_BASE_URL` e `AGENT_MODEL`.

- [ ] **Step 1: Write the failing test**

Acrescente ao `describe` existente em `src/tests/unit/agent/client.test.js`:

```javascript
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../../../lib/agent/client.js'

describe('client — defaults do provedor real', () => {
  it('default aponta para a NVIDIA e o DeepSeek V4 Flash', () => {
    expect(DEFAULT_BASE_URL).toBe('https://integrate.api.nvidia.com/v1')
    expect(DEFAULT_MODEL).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/client.test.js`
Expected: FAIL — `DEFAULT_BASE_URL`/`DEFAULT_MODEL` não exportados.

- [ ] **Step 3: Implement — exportar e usar os defaults**

Em `src/lib/agent/client.js`, no topo do módulo, adicione as constantes e troque os literais:

```javascript
export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-flash-0731'
```

Troque, dentro de `makeRealClient`, o `baseURL`:

```javascript
    baseURL: process.env.AGENT_PROVIDER_BASE_URL || DEFAULT_BASE_URL,
```

E dentro de `stream`, o `model`:

```javascript
      model: model || process.env.AGENT_MODEL || DEFAULT_MODEL,
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/client.test.js`
Expected: PASS (3 testes — os 2 antigos + o novo).

- [ ] **Step 5: Atualizar a nota do design**

Em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`, no fim do §4.1, adicione:

```markdown
**Realidade de provedor (2026-08-09).** No ambiente real a chave é da **NVIDIA** e o
modelo hospedado é `deepseek-ai/deepseek-v4-flash-0731` (o `v4-pro` não está disponível na
conta). O default do código passou a ser NVIDIA + Flash. A decisão "modelo único, sem
roteamento" continua; o objeto do A/B (§13) — provar se o Flash basta — ganhou um dado
inicial: na primeira ligada ao vivo o Flash **acertou** a escolha de tool no caso claro e
**errou** o caso ambíguo (chamou tool em vez de pedir esclarecimento), o que motivou o
reforço da regra de ambiguidade no system prompt.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/client.js src/tests/unit/agent/client.test.js docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "feat(agente): default do cliente -> NVIDIA + deepseek-v4-flash; nota no design"
```

---

## Task 2: Regra de ambiguidade reforçada no system prompt

A ligada ao vivo mostrou o Flash chamando `listar_equipe` para "qual o custo?" em vez de pedir esclarecimento. Reforçar a regra do §6.

**Files:**
- Modify: `src/lib/agent/prompt.js`
- Test: `src/tests/unit/agent/prompt.test.js` (ampliar)

**Interfaces:** sem mudança — `buildSystemPrompt(profile)` continua igual.

- [ ] **Step 1: Write the failing test**

Acrescente em `src/tests/unit/agent/prompt.test.js`:

```javascript
it('tem regra explícita de não escolher tool quando a pergunta é ambígua', () => {
  const p = buildSystemPrompt({ role: 'admin' })
  expect(p).toMatch(/ambígu/i)
  expect(p).toMatch(/não chame nenhuma ferramenta|não use ferramenta/i)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: FAIL — a frase específica ainda não existe.

- [ ] **Step 3: Implement — reforçar a regra**

Em `src/lib/agent/prompt.js`, troque a linha da regra de ambiguidade dentro de `REGRAS` por uma versão mais forte:

```javascript
- Se a pergunta for ambígua ou faltar um parâmetro (qual projeto? que período?), **não chame nenhuma ferramenta**: pergunte o que falta e espere a resposta. Escolher uma ferramenta "no chute" é erro.
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/prompt.js src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): reforca a regra de ambiguidade no system prompt (§6)"
```

---

## Task 3: Tool `custo_por_projeto` (admin) — espelha `/admin/reports/project-cost`

**Files:**
- Create: `src/lib/agent/tools/read/custoPorProjeto.js`
- Test: `src/tests/integration/agent/custoPorProjeto.test.js`

**Interfaces:**
- Consumes: `../../format.js` (`resolvePeriodo`), `../../../db.js` (`query`).
- Produces: default export `{ kind:'read', espelha:'GET /admin/reports/project-cost', roles:['admin'], definition, run(profile, args) }`.
  - `definition.function.name = 'custo_por_projeto'`, `parameters`: `{ periodo: 'hoje'|'semana'|'mes' }` (default `'mes'`).
  - `run(profile, { periodo }) → { data: Array<{ projeto, cliente, total_horas, custo_horistas, pessoas }>, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/custoPorProjeto.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/custoPorProjeto.js'

// Apontamento concluído hoje, com custo explícito.
async function completedToday(userId, projectId, minutes, cost) {
  await query(
    `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
     VALUES ($1,$2, now(), now(), 'completed', $3, $4)`,
    [userId, projectId, minutes, cost],
  )
}

describe('tool custo_por_projeto (admin)', () => {
  let admin, emp, projA, projB
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee', hourly_rate: 100 })
    projA = await makeProject({ name: 'Projeto A' })
    projB = await makeProject({ name: 'Projeto B' })
    await completedToday(emp.id, projA.id, 120, 200)
    await completedToday(emp.id, projA.id, 60, 100)
    await completedToday(emp.id, projB.id, 30, 50)
  })

  it('agrega custo dos horistas por projeto, do maior pro menor', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const a = data.find((p) => p.projeto === 'Projeto A')
    const b = data.find((p) => p.projeto === 'Projeto B')
    expect(a.custo_horistas).toBe(300)
    expect(a.total_horas).toBe(3)
    expect(a.pessoas).toBe(1)
    expect(b.custo_horistas).toBe(50)
    expect(data[0].projeto).toBe('Projeto A') // ordenado por custo desc
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/custoPorProjeto.test.js`
Expected: FAIL — módulo inexistente. (Exige o Postgres de teste de pé.)

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/custoPorProjeto.js
// Espelha GET /admin/reports/project-cost (requireAdmin). Soma cost_snapshot por
// projeto no período. Rótulo é "custo dos horistas" (§8.1): salário fixo aponta
// com custo zero, então isto não é o custo total de mão de obra.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'custo_por_projeto',
    description: 'Custo dos horistas por projeto num período (soma do custo congelado dos apontamentos concluídos). Não inclui quem tem salário fixo.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão mes' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT p.name AS projeto, p.client AS cliente,
            COALESCE(SUM(te.duration_minutes),0)::int AS total_minutes,
            COALESCE(SUM(te.cost_snapshot),0)::numeric AS custo_horistas,
            COUNT(DISTINCT te.user_id)::int AS pessoas
       FROM time_entries te LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.status = 'completed'
        AND te.started_at >= $1::date AND te.started_at < ($2::date + interval '1 day')
      GROUP BY p.name, p.client
      ORDER BY custo_horistas DESC`,
    [inicio, fim],
  )
  const data = rows.map((r) => ({
    projeto: r.projeto || 'Sem projeto',
    cliente: r.cliente || null,
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
    custo_horistas: Number(Number(r.custo_horistas).toFixed(2)),
    pessoas: r.pessoas,
  }))
  return { data, count: data.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/project-cost', roles: ['admin'], definition, run }
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/custoPorProjeto.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/custoPorProjeto.js src/tests/integration/agent/custoPorProjeto.test.js
git commit -m "feat(agente): tool custo_por_projeto (admin, custo dos horistas por projeto)"
```

---

## Task 4: Tool `carga_equipe` (admin) — horas + tarefas abertas por pessoa

**Files:**
- Create: `src/lib/agent/tools/read/cargaEquipe.js`
- Test: `src/tests/integration/agent/cargaEquipe.test.js`

**Interfaces:**
- Produces: `{ kind:'read', espelha:'GET /admin/reports/financial (by_user)', roles:['admin'], definition, run }`.
  - name `carga_equipe`, params `{ periodo }`.
  - `run → { data: Array<{ pessoa, total_horas, apontamentos, tarefas_abertas }>, count }`, ordenado por horas desc.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/cargaEquipe.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/cargaEquipe.js'

describe('tool carga_equipe (admin)', () => {
  let admin, ana, bruno, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 180, 0)`,
      [ana.id, proj.id],
    )
    await query(
      `INSERT INTO tasks (project_id, title, status, assignee_id, position)
       VALUES ($1,'T1','in_progress',$2,0)`,
      [proj.id, ana.id],
    )
  })

  it('mostra horas, apontamentos e tarefas abertas por pessoa', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const a = data.find((p) => p.pessoa === 'Ana')
    expect(a.total_horas).toBe(3)
    expect(a.apontamentos).toBe(1)
    expect(a.tarefas_abertas).toBe(1)
    const b = data.find((p) => p.pessoa === 'Bruno')
    expect(b.total_horas).toBe(0)
    expect(data[0].pessoa).toBe('Ana') // ordenado por horas desc
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/cargaEquipe.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/cargaEquipe.js
// Derivado, admin: horas apontadas no período + tarefas abertas atribuídas, por
// pessoa. Ajuda a ver sobrecarga (muitas horas/tarefas) e ociosidade (zero).
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'carga_equipe',
    description: 'Carga da equipe num período: horas apontadas, nº de apontamentos e nº de tarefas abertas por pessoa. Use para ver quem está sobrecarregado ou ocioso.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa,
            COALESCE(SUM(te.duration_minutes),0)::int AS total_minutes,
            COUNT(te.id)::int AS apontamentos,
            (SELECT COUNT(*) FROM tasks tk
              WHERE tk.assignee_id = u.id
                AND tk.status IN ('todo','in_progress','in_review'))::int AS tarefas_abertas
       FROM users u
       LEFT JOIN time_entries te
         ON te.user_id = u.id AND te.status = 'completed'
        AND te.started_at >= $1::date AND te.started_at < ($2::date + interval '1 day')
      WHERE u.deleted_at IS NULL AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_minutes DESC, u.name`,
    [inicio, fim],
  )
  const data = rows.map((r) => ({
    pessoa: r.pessoa,
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
    apontamentos: r.apontamentos,
    tarefas_abertas: r.tarefas_abertas,
  }))
  return { data, count: data.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/financial (by_user)', roles: ['admin'], definition, run }
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/cargaEquipe.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/cargaEquipe.js src/tests/integration/agent/cargaEquipe.test.js
git commit -m "feat(agente): tool carga_equipe (admin, horas + tarefas por pessoa)"
```

---

## Task 5: Tool `quem_nao_apontou` (admin)

**Files:**
- Create: `src/lib/agent/tools/read/quemNaoApontou.js`
- Test: `src/tests/integration/agent/quemNaoApontou.test.js`

**Interfaces:**
- Produces: `{ kind:'read', espelha:'GET /admin/reports/financial', roles:['admin'], definition, run }`.
  - name `quem_nao_apontou`, params `{ periodo }`.
  - `run → { data: Array<{ pessoa }>, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/quemNaoApontou.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/quemNaoApontou.js'

describe('tool quem_nao_apontou (admin)', () => {
  let admin, ana, bruno, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    // Só a Ana apontou; Bruno e o Chefe não.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 60, 0)`,
      [ana.id, proj.id],
    )
  })

  it('lista os ativos sem apontamento concluído no período', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const nomes = data.map((d) => d.pessoa)
    expect(nomes).toContain('Bruno')
    expect(nomes).toContain('Chefe')
    expect(nomes).not.toContain('Ana')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/quemNaoApontou.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/quemNaoApontou.js
// Derivado, admin: quem está ativo mas não tem nenhum apontamento concluído no
// período. Útil para cobrança de folha de ponto.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'quem_nao_apontou',
    description: 'Pessoas ativas que não têm nenhum apontamento concluído no período. Use para saber quem ainda não bateu ponto.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa
       FROM users u
      WHERE u.deleted_at IS NULL AND u.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM time_entries te
           WHERE te.user_id = u.id AND te.status = 'completed'
             AND te.started_at >= $1::date AND te.started_at < ($2::date + interval '1 day')
        )
      ORDER BY u.name`,
    [inicio, fim],
  )
  return { data: rows, count: rows.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/financial', roles: ['admin'], definition, run }
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/quemNaoApontou.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/quemNaoApontou.js src/tests/integration/agent/quemNaoApontou.test.js
git commit -m "feat(agente): tool quem_nao_apontou (admin)"
```

---

## Task 6: Tool `tasks_travadas` (todos os papéis) — espelha `/tasks`

`GET /tasks` (`projectManagement.js:80`) é `requireAuth` e **não recorta por papel** — devolve todas as tasks a qualquer autenticado. Logo a tool é de **todos os papéis** e devolve as mesmas linhas.

**Files:**
- Create: `src/lib/agent/tools/read/tasksTravadas.js`
- Test: `src/tests/integration/agent/tasksTravadas.test.js`

**Interfaces:**
- Produces: `{ kind:'read', espelha:'GET /tasks', roles:['admin','administrative_intern','project_manager','employee'], definition, run }`.
  - name `tasks_travadas`, params `{ dias?: number }` (padrão 3).
  - `run(profile, { dias }) → { data: Array<{ titulo, projeto, status, dias_parada }>, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/tasksTravadas.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/tasksTravadas.js'

async function makeTask({ project_id, title, status, updatedDaysAgo = 0 }) {
  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, status, position, updated_at)
     VALUES ($1,$2,$3,0, now() - ($4 || ' days')::interval) RETURNING id`,
    [project_id, title, status, String(updatedDaysAgo)],
  )
  return rows[0].id
}

describe('tool tasks_travadas (todos os papéis)', () => {
  let emp, proj
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    proj = await makeProject({ name: 'P' })
    await makeTask({ project_id: proj.id, title: 'Revisão velha', status: 'in_review', updatedDaysAgo: 10 })
    await makeTask({ project_id: proj.id, title: 'Revisão nova', status: 'in_review', updatedDaysAgo: 1 })
    await makeTask({ project_id: proj.id, title: 'Largada', status: 'abandoned', updatedDaysAgo: 0 })
    await makeTask({ project_id: proj.id, title: 'Tocando', status: 'in_progress', updatedDaysAgo: 30 })
  })

  it('traz in_review parada há +N dias e abandoned; não traz revisão nova nem in_progress', async () => {
    const { data } = await tool.run(emp, { dias: 3 })
    const titulos = data.map((t) => t.titulo)
    expect(titulos).toContain('Revisão velha')
    expect(titulos).toContain('Largada')
    expect(titulos).not.toContain('Revisão nova')
    expect(titulos).not.toContain('Tocando')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/tasksTravadas.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/tasksTravadas.js
// Espelha GET /tasks (requireAuth, sem recorte por papel): tasks em in_review
// paradas há mais de N dias, ou abandonadas. dias_parada usa updated_at como
// aproximação de "sem mexer desde".
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'tasks_travadas',
    description: 'Tarefas travadas: em revisão (in_review) há mais de N dias, ou abandonadas. Use para achar o que está preso no fluxo.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'limite de dias em revisão; padrão 3' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const dias = Number.isFinite(args?.dias) && args.dias > 0 ? Math.floor(args.dias) : 3
  const { rows } = await query(
    `SELECT t.title AS titulo, p.name AS projeto, t.status,
            EXTRACT(DAY FROM now() - t.updated_at)::int AS dias_parada
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'abandoned'
         OR (t.status = 'in_review' AND t.updated_at < now() - ($1 || ' days')::interval)
      ORDER BY t.updated_at ASC`,
    [String(dias)],
  )
  return { data: rows, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/tasksTravadas.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/tasksTravadas.js src/tests/integration/agent/tasksTravadas.test.js
git commit -m "feat(agente): tool tasks_travadas (todos os papeis, espelha GET /tasks)"
```

---

## Task 7: Tool `ferias_e_conflitos` (todos os papéis) — espelha `/vacation-calendar`

`GET /vacation-calendar` (`vacations.js:120`) é `requireAuth` e devolve as férias **aprovadas** de todos num intervalo. A tool espelha isso e ainda **detecta sobreposições** (duas pessoas fora ao mesmo tempo).

**Files:**
- Create: `src/lib/agent/tools/read/feriasEConflitos.js`
- Test: `src/tests/integration/agent/feriasEConflitos.test.js`

**Interfaces:**
- Consumes: `../../format.js` (`resolvePeriodo`), `../../../db.js`.
- Produces: `{ kind:'read', espelha:'GET /vacation-calendar', roles:[todos], definition, run }`.
  - name `ferias_e_conflitos`, params `{ periodo }`.
  - `run → { data: { ferias: Array<{ pessoa, inicio, fim, dias }>, conflitos: Array<{ pessoa_a, pessoa_b }> }, count }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/feriasEConflitos.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/feriasEConflitos.js'

async function ferias(userId, ini, fim) {
  await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
     VALUES ($1,$2,$3,$4,'approved')`,
    [userId, ini, fim, 5],
  )
}

describe('tool ferias_e_conflitos (todos os papéis)', () => {
  let emp, ana, bruno, carla
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Quem pergunta' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    carla = await makeUser({ role: 'employee', name: 'Carla' })
    // Ana e Bruno se sobrepõem; Carla não.
    await ferias(ana.id, '2026-08-10', '2026-08-20')
    await ferias(bruno.id, '2026-08-18', '2026-08-25')
    await ferias(carla.id, '2026-09-01', '2026-09-05')
  })

  it('lista as férias do mês e aponta a sobreposição Ana×Bruno', async () => {
    const { data } = await tool.run(emp, { periodo: 'mes' })
    // Nota: o teste usa datas de ago/2026; rode com o relógio do CI/local.
    const nomes = data.ferias.map((f) => f.pessoa)
    expect(nomes).toContain('Ana')
    expect(nomes).toContain('Bruno')
    const par = data.conflitos.map((c) => [c.pessoa_a, c.pessoa_b].sort().join('×'))
    expect(par).toContain('Ana×Bruno')
  })
})
```

> Nota ao implementar: o teste fixa datas de agosto/2026. Se o relógio do ambiente estiver noutro mês, ajuste `periodo` para cobrir as datas, ou troque o teste para inserir férias relativas a `now()`. O padrão do repo (ver `timer.test.js`) é ancorar no relógio do banco — prefira isso se o mês real divergir.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/feriasEConflitos.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement**

```javascript
// src/lib/agent/tools/read/feriasEConflitos.js
// Espelha GET /vacation-calendar (requireAuth): férias aprovadas que tocam o
// período. Além de listar, detecta sobreposições (duas pessoas fora ao mesmo
// tempo) — comparação de pares em JS, barata para o volume de um estúdio.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'ferias_e_conflitos',
    description: 'Férias aprovadas no período e sobreposições (duas ou mais pessoas de férias ao mesmo tempo). Use para planejar cobertura.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

function sobrepoe(a, b) {
  return a.inicio <= b.fim && b.inicio <= a.fim
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa, v.start_date AS inicio, v.end_date AS fim, v.days_count AS dias
       FROM vacation_requests v JOIN users u ON u.id = v.user_id
      WHERE v.status = 'approved'
        AND v.start_date <= $2::date AND v.end_date >= $1::date
      ORDER BY v.start_date ASC`,
    [inicio, fim],
  )
  const ferias = rows.map((r) => ({ pessoa: r.pessoa, inicio: r.inicio, fim: r.fim, dias: r.dias }))
  const conflitos = []
  for (let i = 0; i < ferias.length; i++) {
    for (let j = i + 1; j < ferias.length; j++) {
      if (sobrepoe(ferias[i], ferias[j])) {
        conflitos.push({ pessoa_a: ferias[i].pessoa, pessoa_b: ferias[j].pessoa })
      }
    }
  }
  return { data: { ferias, conflitos }, count: ferias.length }
}

export default {
  kind: 'read', espelha: 'GET /vacation-calendar',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/feriasEConflitos.test.js`
Expected: PASS. Se o mês real divergir de agosto/2026, ajuste conforme a nota do Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/feriasEConflitos.js src/tests/integration/agent/feriasEConflitos.test.js
git commit -m "feat(agente): tool ferias_e_conflitos (todos os papeis, com deteccao de sobreposicao)"
```

---

## Task 8: Registrar as 5 tools no `registry.js` (com paridade de papel)

**Files:**
- Modify: `src/lib/agent/tools/registry.js`
- Test: `src/tests/unit/agent/registry.test.js` (ampliar)

**Interfaces:** `buildRegistry(profile)` inalterado; só cresce a lista `TODAS`.

- [ ] **Step 1: Write the failing test**

Acrescente ao `src/tests/unit/agent/registry.test.js`:

```javascript
describe('registry — tools do M2 por papel', () => {
  it('admin recebe as tools de inteligência e as operacionais', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    for (const n of ['custo_por_projeto', 'carga_equipe', 'quem_nao_apontou', 'tasks_travadas', 'ferias_e_conflitos']) {
      expect(nomes).toContain(n)
    }
  })

  it('colaborador recebe só as operacionais (tasks/férias), não as de inteligência', () => {
    const nomes = buildRegistry({ role: 'employee' }).definitions.map((d) => d.function.name)
    expect(nomes).toContain('tasks_travadas')
    expect(nomes).toContain('ferias_e_conflitos')
    expect(nomes).not.toContain('custo_por_projeto')
    expect(nomes).not.toContain('carga_equipe')
    expect(nomes).not.toContain('quem_nao_apontou')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: FAIL — as tools novas ainda não estão no registry.

- [ ] **Step 3: Implement — registrar as tools**

Em `src/lib/agent/tools/registry.js`, adicione os imports e inclua na lista `TODAS`:

```javascript
import listarEquipe from './read/listarEquipe.js'
import proporEncerrarApontamento from './write/proporEncerrarApontamento.js'
import custoPorProjeto from './read/custoPorProjeto.js'
import cargaEquipe from './read/cargaEquipe.js'
import quemNaoApontou from './read/quemNaoApontou.js'
import tasksTravadas from './read/tasksTravadas.js'
import feriasEConflitos from './read/feriasEConflitos.js'

const TODAS = [
  listarEquipe, proporEncerrarApontamento,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
]
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: PASS (os 2 antigos + os 2 novos grupos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/registry.js src/tests/unit/agent/registry.test.js
git commit -m "feat(agente): registra as 5 tools de leitura do M2 no registry, por papel"
```

---

## Task 9: Domínio (`dominio/`) descreve as tabelas e tools novas

Sem isso o modelo não sabe que pode pedir custo/carga/tasks/férias — o `dominio/` é o mapa que ele lê.

**Files:**
- Modify: `src/lib/agent/context/dominio/core.md`, `admin.md`, `employee.md`
- Test: `src/tests/unit/agent/prompt.test.js` (ampliar)

- [ ] **Step 1: Write the failing test**

Acrescente em `src/tests/unit/agent/prompt.test.js`:

```javascript
it('domínio do admin cita custo por projeto e carga da equipe', () => {
  const p = buildSystemPrompt({ role: 'admin' })
  expect(p).toMatch(/custo por projeto|custo dos horistas/i)
  expect(p).toMatch(/carga da equipe|sobrecarga/i)
})

it('domínio do colaborador cita tarefas travadas e férias', () => {
  const p = buildSystemPrompt({ role: 'employee' })
  expect(p).toMatch(/tarefas? travadas?|in_review/i)
  expect(p).toMatch(/férias/i)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: FAIL — os termos ainda não estão nos `.md`.

- [ ] **Step 3: Implement — ampliar os `.md`**

Adicione ao fim de `src/lib/agent/context/dominio/core.md`:

```markdown

## Tabelas operacionais
- **tasks** — tarefas do kanban dos projetos. Status: todo, in_progress, in_review, done, abandoned.
- **vacation_requests** — solicitações de férias (aprovadas aparecem no calendário).

## O que você pode pedir (operacional, todos)
- **tarefas travadas**: tarefas em in_review há muitos dias, ou abandonadas.
- **férias e conflitos**: quem está de férias no período e se há sobreposição.
```

Adicione ao fim de `src/lib/agent/context/dominio/admin.md`:

```markdown

## Inteligência de gestão (só admin)
- **custo por projeto** (custo dos horistas): soma do custo dos apontamentos por projeto.
- **carga da equipe**: horas e tarefas abertas por pessoa — vê sobrecarga e ociosidade.
- **quem não apontou**: pessoas ativas sem apontamento concluído no período.
```

Adicione ao fim de `src/lib/agent/context/dominio/employee.md`:

```markdown

Você pode consultar **tarefas travadas** (o que está preso no fluxo) e **férias**
(quem está fora e conflitos de data). Não há informação financeira nem de custo.
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: PASS (as 5 asserções do arquivo — 3 antigas + 2 novas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context/dominio/ src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): dominio descreve custo/carga/tasks/ferias por papel (§5)"
```

---

## Task 10: Crescer o eval set + rodar a suíte completa

**Files:**
- Modify: `src/lib/agent/evals/cases.js`
- (Verificação) toda a suíte.

- [ ] **Step 1: Ampliar os casos**

Em `src/lib/agent/evals/cases.js`, adicione ao array `CASES`:

```javascript
  { nome: 'custo por projeto (admin)', papel: 'admin', pergunta: 'qual o custo dos horistas por projeto esse mês?', espera: { toolEsperada: 'custo_por_projeto' } },
  { nome: 'quem não apontou (admin)', papel: 'admin', pergunta: 'quem ainda não apontou esse mês?', espera: { toolEsperada: 'quem_nao_apontou' } },
  { nome: 'tasks travadas (colaborador)', papel: 'employee', pergunta: 'tem alguma tarefa travada em revisão?', espera: { toolEsperada: 'tasks_travadas' } },
  { nome: 'férias (colaborador)', papel: 'employee', pergunta: 'quem vai estar de férias esse mês?', espera: { toolEsperada: 'ferias_e_conflitos' } },
  { nome: 'ambíguo continua pedindo esclarecimento', papel: 'admin', pergunta: 'me mostra os números', espera: { pedirEsclarecimento: true, naoInventar: true } },
```

- [ ] **Step 2: Rodar a suíte inteira do backend (nada regrediu)**

Run: `cd src && npm test`
Expected: tudo verde — os testes do M1, os 5 novos de integração do M2 e os unit ampliados.

- [ ] **Step 3 (opcional, exige chave real): rodar o eval contra o modelo**

Run: `cd src && npm run test:evals`
Expected: relatório de acerto de tool por caso. Serve para medir o Flash nos casos novos e re-checar a regra de ambiguidade reforçada (Task 2). Não bloqueia — é medição, não CI.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/evals/cases.js
git commit -m "feat(agente): eval set cobre as tools do M2 e a ambiguidade reforcada (§13)"
```

---

## Self-Review

**1. Cobertura (design §8.1 → task):**

| Item do design | Task |
|---|---|
| `custo_por_projeto` ("custo dos horistas") | Task 3 |
| `horas_por_projeto` | Folded no Task 3 (custo já devolve `total_horas`) |
| `carga_equipe` (sobrecarga/ociosidade) | Task 4 |
| `quem_nao_apontou` | Task 5 |
| `tasks_travadas` | Task 6 |
| `ferias_e_conflitos` | Task 7 |
| catálogo por papel (§8) | Task 8 (registry) |
| `dominio/` fatiado por papel (§5) | Task 9 |
| eval set (§13) | Task 10 |
| config real do provedor (§4.1) | Task 1 |
| regra de ambiguidade (§6) | Task 2 |

**Deixado de fora, de propósito (registrado):**
- **Expansão do `scope.js`** — nenhuma tool do M2 tem coluna/linha sensível que varie por papel (ver nota de escopo). Entra quando surgir uma tool com omissão de coluna por papel numa entidade nova.
- `projecao_estouro`, `simulacao_performance`, `status_projeto`, `andamento_de_projeto` — próximos lotes.
- Tool de SQL restrito + role read-only (§8.2), tools de escrita novas, polish do widget, feature flag — milestones seguintes.

**2. Placeholder scan:** todo step traz código real + comando de teste com resultado esperado. Nenhum "TBD/TODO".

**3. Consistência de tipos/nomes:**
- Toda tool segue o shape `{ kind:'read', espelha, roles, definition, run }` — igual ao M1 e consumido pelo `registry`/`loop` sem mudança.
- `resolvePeriodo(nome) → { inicio, fim }` (de `format.js`, M1) consumido em Tasks 3, 4, 5, 7.
- `run(profile, args) → { data, count }` — o `loop.js` já serializa `data` como mensagem `role:'tool'` e audita `count`; nada muda no núcleo.
- Nomes de tool (`custo_por_projeto`, `carga_equipe`, `quem_nao_apontou`, `tasks_travadas`, `ferias_e_conflitos`) idênticos entre a `definition`, o `registry` (Task 8), o `dominio/` (Task 9) e o eval set (Task 10).

**Pré-requisitos de ambiente:** os testes de integração (Tasks 3–7) exigem o Postgres de teste (`docker-compose.test.yml`). Unit (Tasks 1, 2, 8, 9) rodam sem banco. Nenhuma migration nova, nenhum secret novo — o M2 é só código.
