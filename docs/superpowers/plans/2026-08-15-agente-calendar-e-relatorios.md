# Agente: Calendar leitura + relatórios em arquivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente lê a agenda da pessoa (iCal já ligado + escritório + feriados) e o admin baixa um arquivo (md/csv/xlsx/pdf) montado pela reexecução das tools de leitura, sem persistir o arquivo.

**Architecture:** Extraímos `listEventsForUser` de `routes/calendar.js` para `lib/calendar/events.js` (rota e tool compartilham). `gerar_relatorio` (admin) reexecuta tools `kind: 'read'` e um renderer determinístico monta o buffer. `downloads.js` guarda o buffer num Map (TTL 5 min, teto 10 MB). O loop emite SSE `file`; o chat baixa via `GET /agent/downloads/:token`.

**Tech Stack:** Node/Express ESM, Vitest, React/Vite, `exceljs`, `pdfkit`, `pdf-parse` (já no projeto, só para assert de PDF), `node-ical` (já no projeto).

**Spec:** `docs/superpowers/specs/2026-08-15-agente-calendar-e-relatorios-design.md`

## Global Constraints

- **Paridade Calendar:** a tool alcança exatamente `GET /me/calendar/events` — própria Google + `OFFICE_ICS_URL` + feriados. Sem parâmetro de pessoa.
- **Relatório:** só `roles: ['admin']`. `espelha: null` (entra no `semEspelho` de `paridadePapel.test.js`).
- **Modelo nunca manda a tabela:** `gerar_relatorio` não aceita `linhas`/`dados`. Reexecuta `tool.run(profile, params)`.
- **Arquivo:** memória, `DOWNLOAD_TTL_MS = 5 * 60 * 1000`, teto `10 * 1024 * 1024` bytes, vários GETs no TTL. Sem Tigris, sem disco, sem e-mail.
- **Download HTTP:** `requireAuth` só — sem kill switch, sem `AGENT_API_KEY`.
- **Fuso:** `America/Sao_Paulo`. `amanha` só em `agenda_do_periodo`, não em `resolvePeriodo`.
- **Intervalo Calendar:** máx. 31 dias inclusivos. `periodo` XOR `inicio`+`fim`.
- **Fontes:** 1–6; máx. 500 linhas por seção no arquivo.
- **Erros ao usuário:** português, sem jargão (SQL, tool, token, Map).
- **Testes:** `cd src && npx vitest run <arquivo>`. Front: `cd web && npx vitest run <arquivo>`.
- **Commits:** uma mensagem por task, em português/inglês no estilo do repo (`feat(agente): …`).

### Paralelismo (ondas)

| Onda | Tasks | Dependem de |
|---|---|---|
| 1 | Task 1, Task 3 | nada — arquivos disjuntos |
| 2 | Task 2, Task 4 | 1 e 3 respectivamente |
| 3 | Task 5 | Task 4 (e 2 se o emit for testado com agenda) |
| 4 | Task 6 | Task 5 |

Não rodar duas tasks da mesma onda no **mesmo** worktree. Worktrees isolados + merge depois, ou sequencial.

---

## File structure

**Novos**
- `src/lib/calendar/events.js` — fetch/parse/cache iCal + `listEventsForUser` + `isCalendarConnected`
- `src/lib/agent/tools/catalog.js` — array `TODAS` extraído de `registry.js`
- `src/lib/agent/tools/read/agendaDoPeriodo.js`
- `src/lib/agent/tools/read/gerarRelatorio.js`
- `src/lib/agent/reports/render.js` — `renderRelatorio({ titulo, formato, secoes }) → Buffer`
- `src/lib/agent/reports/slug.js` — `slugArquivo(titulo, hojeYmd, ext)`
- `src/lib/agent/reports/md.js`, `csv.js`, `xlsx.js`, `pdf.js`
- `src/lib/agent/downloads.js`
- testes unit/integration correspondentes

**Tocados**
- `src/routes/calendar.js` — wrapper + reexport `isValidIcsUrl`, `isPrivateOrReservedIp`
- `src/routes/agent.js` — `GET /agent/downloads/:token`
- `src/lib/agent/tools/registry.js` — importa `TODAS` do catálogo
- `src/lib/agent/loop.js` — emite `file`, não coloca `arquivo` no histórico
- `src/lib/agent/audit.js` — `logReportGenerated`
- `src/lib/agent/context/dominio/core.md`, `admin.md`
- `src/tests/integration/agent/paridadePapel.test.js`
- `src/package.json` — `exceljs`, `pdfkit`
- `web/src/lib/agentClient.js`, `agentSession.js`, `pages/AssistentePage.jsx`

---

### Task 1: Extrair `lib/calendar/events.js`

**Files:**
- Create: `src/lib/calendar/events.js`
- Modify: `src/routes/calendar.js`
- Test: `src/tests/unit/calendarSsrf.test.js` (já existe; continua verde)
- Test: `src/tests/unit/calendarEvents.test.js` (novo: `isCalendarConnected` + intervalo da extração)

**Interfaces:**
- Produces:
  - `isValidIcsUrl(raw) → boolean`
  - `isPrivateOrReservedIp(ip) → boolean`
  - `isCalendarConnected(userId) → Promise<boolean>` — `SELECT 1 FROM user_calendars WHERE user_id = $1`
  - `listEventsForUser(userId, start: Date, end: Date) → Promise<{ events, calendar_error }>`
    - `events` no formato atual da rota (`id`, `title`, `start`, `end`, `all_day`, `location`, `description`, `source`)
    - mesma interpretação de datas da rota (`start` = `new Date(`${ymd}T00:00:00`)`, `end` = `T23:59:59`)
  - `routes/calendar.js` **reexporta** `isValidIcsUrl` e `isPrivateOrReservedIp` (o teste SSRF atual importa da rota)

- [ ] **Step 1: Escrever o teste da extração (ainda sem o módulo)**

Crie `src/tests/unit/calendarEvents.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

describe('lib/calendar/events — API extraída', () => {
  it('exporta isValidIcsUrl, isPrivateOrReservedIp, listEventsForUser, isCalendarConnected', async () => {
    const mod = await import('../../lib/calendar/events.js')
    expect(typeof mod.isValidIcsUrl).toBe('function')
    expect(typeof mod.isPrivateOrReservedIp).toBe('function')
    expect(typeof mod.listEventsForUser).toBe('function')
    expect(typeof mod.isCalendarConnected).toBe('function')
  })

  it('isValidIcsUrl continua rejeitando host arbitrário (mesmo contrato da rota)', async () => {
    const { isValidIcsUrl } = await import('../../lib/calendar/events.js')
    expect(isValidIcsUrl('https://evil.example.com/steal.ics')).toBe(false)
    expect(isValidIcsUrl('https://calendar.google.com/calendar/ical/x/basic.ics')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && npx vitest run tests/unit/calendarEvents.test.js`
Expected: FAIL — `Cannot find module` ou export ausente.

- [ ] **Step 3: Mover a lógica**

1. Criar `src/lib/calendar/events.js` com **todo** o código hoje privado em `routes/calendar.js` que não é rota: `isAllowedIcsHost`, `isValidIcsUrl`, `isPrivateOrReservedIp`, `assertPublicHostname`, `fetchIcsText`, `makeEvent`, `eventsInRange`, `getParsedCalendar`, `getStoredUrl`, cache `parsedCache` / `CACHE_TTL_MS`, mais:

```js
export async function isCalendarConnected(userId) {
  const { rows } = await query('SELECT 1 FROM user_calendars WHERE user_id = $1', [userId])
  return rows.length > 0
}

export async function listEventsForUser(userId, start, end) {
  // Corpo atual de GET /me/calendar/events a partir dos feriados,
  // usando userId no lugar de req.profile.id.
  // Devolve { events, calendar_error } — NÃO { conectado }.
}
```

Exportar também `isValidIcsUrl` e `isPrivateOrReservedIp`.

2. Em `routes/calendar.js`: importar essas funções; `GET /me/calendar/events` chama `listEventsForUser(req.profile.id, start, end)` e faz `res.json`. Reexportar:

```js
export { isValidIcsUrl, isPrivateOrReservedIp } from '../lib/calendar/events.js'
```

Não mudar o JSON da rota (`{ events, calendar_error }`).

- [ ] **Step 4: Rodar os testes da extração + SSRF + (se existir) integração de calendar**

Run: `cd src && npx vitest run tests/unit/calendarEvents.test.js tests/unit/calendarSsrf.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/events.js src/routes/calendar.js src/tests/unit/calendarEvents.test.js
git commit -m "refactor(calendar): extrai listEventsForUser para lib/calendar/events"
```

---

### Task 2: Tool `agenda_do_periodo`

**Files:**
- Create: `src/lib/agent/tools/read/agendaDoPeriodo.js`
- Modify: `src/lib/agent/tools/registry.js` (ou `catalog.js` se a Task 4 já o criou — se o catálogo ainda não existir, registre direto no array `TODAS` de `registry.js`)
- Modify: `src/lib/agent/context/dominio/core.md`
- Modify: `src/tests/integration/agent/paridadePapel.test.js`
- Test: `src/tests/unit/agent/agendaDoPeriodo.test.js`
- Test: `src/tests/integration/agent/agendaDoPeriodo.test.js`

**Interfaces:**
- Consumes: `listEventsForUser`, `isCalendarConnected`, `resolvePeriodo` (`hoje`/`semana`/`mes` only)
- Produces: default export `{ kind: 'read', espelha: 'GET /me/calendar/events', roles: ['admin','administrative_intern','project_manager','employee'], definition, run }`
- `run(profile, args) → { data, count, conectado, calendar_error }`
- `data[]`: `{ titulo, inicio, fim, dia_todo, local, fonte }` — **sem** `id`, **sem** `description`
- Schema: `periodo` enum `hoje|amanha|semana|mes` **ou** `inicio`+`fim` (`YYYY-MM-DD`). `additionalProperties: false`. Sem campo de pessoa.

- [ ] **Step 1: Teste unitário do recorte de período (sem iCal)**

Crie `src/tests/unit/agent/agendaDoPeriodo.test.js`. Use `vi.spyOn` em `listEventsForUser` / `isCalendarConnected` **só depois** de o módulo existir — neste step o teste deve falhar no import:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'u1', role: 'employee' }

describe('agenda_do_periodo — parâmetros', () => {
  it('recusa periodo e inicio juntos', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, {
      periodo: 'hoje', inicio: '2026-08-15', fim: '2026-08-15',
    })).rejects.toThrow(/recorte|período|periodo/i)
  })

  it('recusa inicio sem fim', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, { inicio: '2026-08-15' })).rejects.toThrow()
  })

  it('recusa intervalo com mais de 31 dias inclusivos', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, {
      inicio: '2026-08-01', fim: '2026-09-01', // 32 dias
    })).rejects.toThrow(/31/)
  })

  it('schema não tem parâmetro de pessoa', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    const props = tool.definition.function.parameters.properties
    expect(props.user_id).toBeUndefined()
    expect(props.pessoa).toBeUndefined()
    expect(props.nome).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && npx vitest run tests/unit/agent/agendaDoPeriodo.test.js`
Expected: FAIL — módulo ausente.

- [ ] **Step 3: Implementar a tool**

```js
// src/lib/agent/tools/read/agendaDoPeriodo.js
import { resolvePeriodo } from '../../format.js'
import { listEventsForUser, isCalendarConnected } from '../../../calendar/events.js'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 31

function diasInclusivos(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000) + 1
}

function amanhaYmd(now = new Date()) {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [y, m, d] = hoje.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().slice(0, 10)
}

function resolverJanela(args, now) {
  const temPeriodo = args?.periodo != null && args.periodo !== ''
  const temInicio = args?.inicio != null && args.inicio !== ''
  const temFim = args?.fim != null && args.fim !== ''
  if (temPeriodo && (temInicio || temFim)) throw new Error('informe só o período ou só inicio e fim')
  if (temInicio !== temFim) throw new Error('inicio e fim são obrigatórios juntos')
  let inicio, fim
  if (temInicio) {
    if (!YMD.test(args.inicio) || !YMD.test(args.fim)) throw new Error('inicio e fim devem ser YYYY-MM-DD')
    inicio = args.inicio
    fim = args.fim
  } else if (args?.periodo === 'amanha') {
    const a = amanhaYmd(now)
    inicio = a
    fim = a
  } else {
    const p = resolvePeriodo(args?.periodo || 'hoje', now)
    inicio = p.inicio
    fim = p.fim
  }
  if (diasInclusivos(inicio, fim) > MAX_DIAS) throw new Error('o intervalo máximo é 31 dias; peça um recorte menor')
  if (fim < inicio) throw new Error('fim não pode ser antes de inicio')
  return { inicio, fim }
}

function mapear(ev) {
  return {
    titulo: ev.title,
    inicio: ev.start,
    fim: ev.end,
    dia_todo: ev.all_day,
    local: ev.location,
    fonte: ev.source,
  }
}

const definition = {
  type: 'function',
  function: {
    name: 'agenda_do_periodo',
    description:
      'Eventos da SUA agenda no período: Google pessoal (se ligada), agenda do escritório e feriados. Não vê a agenda de outra pessoa. periodo: hoje (padrão), amanha, semana ou mes; ou inicio+fim YYYY-MM-DD (máx. 31 dias).',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'amanha', 'semana', 'mes'] },
        inicio: { type: 'string', description: 'YYYY-MM-DD' },
        fim: { type: 'string', description: 'YYYY-MM-DD' },
      },
      additionalProperties: false,
    },
  },
}

async function run(profile, args, now = new Date()) {
  const { inicio, fim } = resolverJanela(args, now)
  const start = new Date(`${inicio}T00:00:00`)
  const end = new Date(`${fim}T23:59:59`)
  const [conectado, { events, calendar_error }] = await Promise.all([
    isCalendarConnected(profile.id),
    listEventsForUser(profile.id, start, end),
  ])
  const data = events.map(mapear)
  return { data, count: data.length, conectado, calendar_error }
}

export default {
  kind: 'read',
  espelha: 'GET /me/calendar/events',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition,
  run,
}
```

Registrar no catálogo/`TODAS`. Em `core.md`, no bloco “O que você pode pedir (todos)”, acrescente:

```
- **agenda do período**: seus eventos no intervalo (Google pessoal se estiver
  ligado no Perfil, agenda do escritório e feriados). Não existe agenda de
  outra pessoa — se pedirem a da Vivian, recuse e ofereça a dela própria ou a
  do escritório, sem explicar recorte de papel.
```

Em `paridadePapel.test.js`:
- importar `agendaDoPeriodo`
- adicionar em `CASOS`: `{ tool: agendaDoPeriodo, chamar: (u) => [asUser(u).get('/me/calendar/events?start=2026-08-01&end=2026-08-07')] }`

Integração `src/tests/integration/agent/agendaDoPeriodo.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/agendaDoPeriodo.js'

describe('paridade agenda_do_periodo ↔ GET /me/calendar/events', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })

  it('os eventos mapeados da tool batem com a rota no mesmo intervalo', async () => {
    const inicio = '2026-08-15'
    const fim = '2026-08-16'
    const rota = await asUser(emp).get(`/me/calendar/events?start=${inicio}&end=${fim}`)
    expect(rota.status).toBe(200)
    const { data, calendar_error } = await tool.run(emp, { inicio, fim })
    const mapeados = rota.body.events.map((ev) => ({
      titulo: ev.title, inicio: ev.start, fim: ev.end,
      dia_todo: ev.all_day, local: ev.location, fonte: ev.source,
    }))
    expect(data).toEqual(mapeados)
    expect(calendar_error).toBe(rota.body.calendar_error)
  })
})
```

(Sem iCal pessoal o `data` ainda inclui feriados/escritório — a paridade vale.)

- [ ] **Step 4: Rodar testes**

Run: `cd src && npx vitest run tests/unit/agent/agendaDoPeriodo.test.js tests/integration/agent/agendaDoPeriodo.test.js tests/integration/agent/paridadePapel.test.js tests/unit/agent/registry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/read/agendaDoPeriodo.js src/lib/agent/tools/registry.js src/lib/agent/tools/catalog.js src/lib/agent/context/dominio/core.md src/tests/unit/agent/agendaDoPeriodo.test.js src/tests/integration/agent/agendaDoPeriodo.test.js src/tests/integration/agent/paridadePapel.test.js
git commit -m "feat(agente): tool agenda_do_periodo com paridade da Agenda"
```

---

### Task 3: `downloads.js` + `GET /agent/downloads/:token`

**Files:**
- Create: `src/lib/agent/downloads.js`
- Modify: `src/routes/agent.js`
- Test: `src/tests/unit/agent/downloads.test.js`
- Test: `src/tests/integration/agent/downloads.test.js`

**Interfaces:**
- Produces:
  - `DOWNLOAD_TTL_MS = 5 * 60 * 1000`
  - `DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024`
  - `remember({ profile, buffer, filename, mime, now = Date.now() }) → { token }`
    - se `buffer.length > DOWNLOAD_MAX_BYTES`, lança `Error` com mensagem em português contendo “grande demais”
  - `get(token, profile, now = Date.now()) → { buffer, filename, mime } | null`
    - `null` se sumiu, expirou, `userId` ≠ ou `role` ≠
    - **não** apaga no get
  - `pendingCount() → number`
  - expurgo preguiçoso em `remember`, igual `proposals.js`

- [ ] **Step 1: Teste unitário**

```js
// src/tests/unit/agent/downloads.test.js
import { describe, it, expect } from 'vitest'
import { remember, get, pendingCount, DOWNLOAD_TTL_MS, DOWNLOAD_MAX_BYTES } from '../../../lib/agent/downloads.js'

const admin = { id: '1', role: 'admin' }
const outro = { id: '2', role: 'admin' }

describe('downloads — Map em memória, TTL, vários gets', () => {
  it('guarda e devolve o buffer para o dono', () => {
    const buf = Buffer.from('hello')
    const { token } = remember({ profile: admin, buffer: buf, filename: 'a.csv', mime: 'text/csv', now: 1000 })
    const got = get(token, admin, 1000)
    expect(got.filename).toBe('a.csv')
    expect(got.mime).toBe('text/csv')
    expect(Buffer.compare(got.buffer, buf)).toBe(0)
  })

  it('segundo get no TTL ainda funciona', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, admin, 1000)).not.toBeNull()
    expect(get(token, admin, 1000)).not.toBeNull()
  })

  it('nega outro usuário', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, outro, 1000)).toBeNull()
  })

  it('nega se o papel mudou', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, { id: '1', role: 'employee' }, 1000)).toBeNull()
  })

  it('expira após o TTL', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, admin, 1000 + DOWNLOAD_TTL_MS + 1)).toBeNull()
  })

  it('recusa buffer acima de 10 MB', () => {
    const grande = Buffer.alloc(DOWNLOAD_MAX_BYTES + 1)
    expect(() => remember({ profile: admin, buffer: grande, filename: 'a.bin', mime: 'application/octet-stream', now: 1000 }))
      .toThrow(/grande demais/i)
  })

  it('expurga vencidos ao criar o próximo', () => {
    const base = 20_000_000
    remember({ profile: admin, buffer: Buffer.from('a'), filename: 'a.csv', mime: 'text/csv', now: base })
    remember({ profile: admin, buffer: Buffer.from('b'), filename: 'b.csv', mime: 'text/csv', now: base + DOWNLOAD_TTL_MS + 1 })
    expect(pendingCount()).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && npx vitest run tests/unit/agent/downloads.test.js`
Expected: FAIL — módulo ausente.

- [ ] **Step 3: Implementar `downloads.js` (espelhar `proposals.js`)**

Copie a estrutura de `src/lib/agent/proposals.js`: `Map`, `randomUUID`, `expurgar` no `remember`, checagem `userId`+`role`+TTL no `get`. Diferenças: `get` **não** dá `delete`; `remember` recusa `buffer.length > DOWNLOAD_MAX_BYTES`.

- [ ] **Step 4: Teste de integração da rota + implementar a rota**

```js
// src/tests/integration/agent/downloads.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser, request } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { remember } from '../../../lib/agent/downloads.js'

describe('GET /agent/downloads/:token', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee' })
  })

  it('401 sem JWT', async () => {
    const res = await request.get('/agent/downloads/qualquer')
    expect(res.status).toBe(401)
  })

  it('404 de outro usuário, mensagem genérica', async () => {
    const { token } = remember({
      profile: admin, buffer: Buffer.from('abc'), filename: 'r.csv', mime: 'text/csv',
    })
    const res = await asUser(emp).get(`/agent/downloads/${token}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/expirado ou indisponível/i)
  })

  it('200 do dono com attachment e o buffer', async () => {
    const { token } = remember({
      profile: admin, buffer: Buffer.from('abc'), filename: 'r.csv', mime: 'text/csv',
    })
    const res = await asUser(admin).get(`/agent/downloads/${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.headers['content-disposition']).toMatch(/r\.csv/)
    expect(res.text).toBe('abc')
  })
})
```

Em `routes/agent.js`, **depois** das rotas de chat/execute, **sem** `agenteDesligado`/`agenteSemChave`:

```js
import { get as getDownload } from '../lib/agent/downloads.js'

router.get('/agent/downloads/:token', requireAuth, async (req, res) => {
  const rec = getDownload(req.params.token, req.profile)
  if (!rec) return res.status(404).json({ error: 'arquivo expirado ou indisponível' })
  res.setHeader('Content-Type', rec.mime)
  res.setHeader('Content-Disposition', `attachment; filename="${rec.filename}"`)
  return res.send(rec.buffer)
})
```

`filename` já é slug ASCII (Task 4) — sem `filename*`.

- [ ] **Step 5: Rodar testes**

Run: `cd src && npx vitest run tests/unit/agent/downloads.test.js tests/integration/agent/downloads.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/downloads.js src/routes/agent.js src/tests/unit/agent/downloads.test.js src/tests/integration/agent/downloads.test.js
git commit -m "feat(agente): download efêmero GET /agent/downloads/:token"
```

---

### Task 4: Catálogo, renderers e `gerar_relatorio`

**Files:**
- Create: `src/lib/agent/tools/catalog.js`
- Modify: `src/lib/agent/tools/registry.js` — `import { TODAS } from './catalog.js'`
- Create: `src/lib/agent/reports/slug.js`, `md.js`, `csv.js`, `xlsx.js`, `pdf.js`, `render.js`
- Create: `src/lib/agent/tools/read/gerarRelatorio.js`
- Modify: `src/lib/agent/audit.js` — `logReportGenerated`
- Modify: `src/package.json` — deps `exceljs`, `pdfkit` (`npm install exceljs pdfkit` em `src/`)
- Modify: `src/tests/integration/agent/paridadePapel.test.js` — `semEspelho` inclui `gerar_relatorio`
- Test: `src/tests/unit/agent/reportsRender.test.js`
- Test: `src/tests/unit/agent/gerarRelatorio.test.js`
- Test: `src/tests/unit/agent/audit.test.js` (caso novo de `logReportGenerated`)

**Interfaces:**
- Consumes: `TODAS` do catálogo, `remember`, `logReportGenerated`, `DOWNLOAD_MAX_BYTES`
- Produces:
  - `slugArquivo(titulo, hojeYmd, ext) → string` — NFD, minúsculas, não-alnum → `-`, colapsa, máx. 60 + `-${hojeYmd}.${ext}`
  - `renderRelatorio({ titulo, formato, secoes, geradoEm }) → Buffer`
    - `secoes`: `[{ titulo, fonte, rows, erro? }]`
    - `formato`: `md|csv|xlsx|pdf`
  - `gerar_relatorio.run(profile, args) → { data, count, arquivo: { token, filename, mime, bytes } }`
  - `data`: `{ ok, filename, formato, secoes: [{ fonte, linhas }] | [{ fonte, erro }] }`
  - MIME: `text/csv` · `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` · `application/pdf` · `text/markdown`

- [ ] **Step 1: Instalar deps + teste dos renderers (falha sem os módulos)**

```bash
cd src && npm install exceljs pdfkit
```

Crie `src/tests/unit/agent/reportsRender.test.js`:

```js
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { PDFParse } from 'pdf-parse'

const secoes = [
  { titulo: 'Quem não apontou', fonte: 'quem_nao_apontou', rows: [{ pessoa: 'Ana' }, { pessoa: 'Bia' }] },
  { titulo: 'Custo', fonte: 'custo_por_projeto', rows: [{ projeto: 'Acme', custo_horistas: 100 }] },
]

describe('renderRelatorio', () => {
  it('md contém as células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = renderRelatorio({ titulo: 'Semana', formato: 'md', secoes, geradoEm: '15/08/2026 10:00' })
    const t = buf.toString('utf8')
    expect(t).toContain('Ana')
    expect(t).toContain('Acme')
  })

  it('csv escapa e junta seções', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const t = renderRelatorio({
      titulo: 'S', formato: 'csv',
      secoes: [{ titulo: 'A', fonte: 'x', rows: [{ nome: 'a,b', n: 1 }] }],
      geradoEm: 'x',
    }).toString('utf8')
    expect(t).toContain('"a,b"')
  })

  it('xlsx tem uma aba por fonte e as células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = renderRelatorio({ titulo: 'S', formato: 'xlsx', secoes, geradoEm: 'x' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.length).toBe(2)
    expect(wb.worksheets[0].getCell('A2').value).toBe('Ana')
  })

  it('pdf contém o texto das células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = renderRelatorio({ titulo: 'Relatório Semana', formato: 'pdf', secoes, geradoEm: '15/08/2026' })
    const parser = new PDFParse({ data: buf })
    const { text } = await parser.getText()
    await parser.destroy()
    expect(text).toMatch(/Ana/)
    expect(text).toMatch(/Acme/)
  })

  it('seção com erro vira aviso e a outra entra', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const t = renderRelatorio({
      titulo: 'S', formato: 'md',
      secoes: [
        { titulo: 'X', fonte: 'x', rows: [], erro: 'fonte falhou' },
        { titulo: 'Y', fonte: 'y', rows: [{ ok: 1 }] },
      ],
      geradoEm: 'x',
    }).toString('utf8')
    expect(t).toMatch(/fonte falhou/)
    expect(t).toContain('ok')
  })
})

describe('slugArquivo', () => {
  it('gera slug + data + extensão', async () => {
    const { slugArquivo } = await import('../../../lib/agent/reports/slug.js')
    expect(slugArquivo('Semana 11/08 — ponto e custo', '2026-08-15', 'xlsx'))
      .toBe('semana-11-08-ponto-e-custo-2026-08-15.xlsx')
  })
})
```

> `pdf-parse` v2 exporta `PDFParse`. Se o import nomeado falhar no RED, use o que o pacote realmente exporta (default/classe) — o assert é “texto contém Ana”.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && npx vitest run tests/unit/agent/reportsRender.test.js`
Expected: FAIL — módulo ausente.

- [ ] **Step 3: Implementar slug + 4 renderers + `renderRelatorio`**

- `slug.js`: NFD, lower case, replace `/[^a-z0-9]+/g` → `-`, trim hífens, slice 60, `-${hojeYmd}.${ext}`.
- `md.js` / `csv.js`: se `rows` é array de objetos, colunas = `Object.keys(rows[0])`. CSV escapa `"` e vírgula. Seção com `erro`: uma linha de aviso, sem tabela.
- `xlsx.js`: `exceljs`; nome da aba = título sanitizado, máx. 31, sufixo ` (2)` se colidir; aba de erro com a mensagem na A1.
- `pdf.js`: `pdfkit`, A4, Helvetica, título + `geradoEm`, tabela simples (colunas cabem na largura). Sem logo.
- `render.js`: switch de formato; lança se formato desconhecido.

Normalização de `data` da tool (em `gerarRelatorio`, não no renderer):
- array de objetos → `rows`
- objeto único → `Object.entries` → `{ chave, valor }`
- outro → `[{ valor: JSON.stringify(data) }]`
- corta em 500; se `N > 500`, anexa nota na seção (`aviso: 'mostrando 500 de N'`) — o renderer imprime o aviso acima da tabela.

- [ ] **Step 4: Teste de `gerar_relatorio` + implementação**

```js
// src/tests/unit/agent/gerarRelatorio.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const admin = { id: '1', role: 'admin' }

describe('gerar_relatorio', () => {
  it('recusa fonte inexistente', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv', fontes: [{ tool: 'nao_existe', params: {} }],
    })).rejects.toThrow()
  })

  it('recusa o próprio gerar_relatorio como fonte', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv', fontes: [{ tool: 'gerar_relatorio', params: {} }],
    })).rejects.toThrow()
  })

  it('recusa 0 fontes e 7 fontes', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, { titulo: 'X', formato: 'csv', fontes: [] })).rejects.toThrow()
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv',
      fontes: Array.from({ length: 7 }, () => ({ tool: 'quem_nao_apontou', params: { periodo: 'hoje' } })),
    })).rejects.toThrow()
  })

  it('números do arquivo vêm da tool reexecutada, não de um campo linhas', async () => {
    const quem = await import('../../../lib/agent/tools/read/quemNaoApontou.js')
    vi.spyOn(quem.default, 'run').mockResolvedValue({ data: [{ pessoa: 'Zed' }], count: 1 })
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    const res = await tool.run(admin, {
      titulo: 'Ponto', formato: 'csv',
      fontes: [{ tool: 'quem_nao_apontou', params: { periodo: 'semana' }, linhas: [{ pessoa: 'FAKE' }] }],
    })
    expect(res.data.ok).toBe(true)
    expect(res.arquivo.token).toBeTruthy()
    const { get } = await import('../../../lib/agent/downloads.js')
    const rec = get(res.arquivo.token, admin)
    expect(rec.buffer.toString('utf8')).toContain('Zed')
    expect(rec.buffer.toString('utf8')).not.toContain('FAKE')
    vi.restoreAllMocks()
  })
})
```

`catalog.js`: mover o array `TODAS` e os imports de `registry.js`. `registry.js` fica só com `buildRegistry`. Incluir `agendaDoPeriodo` e `gerarRelatorio` no array.

`gerarRelatorio.js`:
- `roles: ['admin']`, `kind: 'read'`, `espelha: null`
- valida formato ∈ `{md,csv,xlsx,pdf}`
- para cada fonte: achar em `TODAS` por `definition.function.name`; exigir `kind === 'read'`, `roles.includes('admin')`, nome ≠ `gerar_relatorio`
- `try/catch` por fonte; se **todas** falharem, `throw new Error('não consegui montar o relatório; refine as fontes')`
- `remember`; se `remember` lançar (10 MB), propagar
- `logReportGenerated({ profile, formato, fontes: nomes, bytes: buffer.length, filename })`
- devolver `arquivo` **e** `data` sem o buffer

`audit.js`:

```js
export function logReportGenerated({ profile, formato, fontes, bytes, filename }) {
  logger.info({
    evt: 'agent_report_generated',
    user_id: profile?.id, formato, fontes, bytes, filename,
  })
}
```

`paridadePapel.test.js`: `semEspelho` adiciona `'gerar_relatorio'`.

- [ ] **Step 5: Rodar testes**

Run: `cd src && npx vitest run tests/unit/agent/reportsRender.test.js tests/unit/agent/gerarRelatorio.test.js tests/unit/agent/registry.test.js tests/integration/agent/paridadePapel.test.js tests/unit/agent/audit.test.js`
Expected: PASS. `gerar_relatorio` no registry do admin; ausente nos outros (adicione um `it` em `registry.test.js` se ainda não cobrir).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tools/catalog.js src/lib/agent/tools/registry.js src/lib/agent/reports src/lib/agent/tools/read/gerarRelatorio.js src/lib/agent/audit.js src/package.json src/package-lock.json src/tests/unit/agent/reportsRender.test.js src/tests/unit/agent/gerarRelatorio.test.js src/tests/unit/agent/registry.test.js src/tests/integration/agent/paridadePapel.test.js src/tests/unit/agent/audit.test.js
git commit -m "feat(agente): gerar_relatorio com md/csv/xlsx/pdf e catálogo extraído"
```

---

### Task 5: Loop emite `file` + prompt admin

**Files:**
- Modify: `src/lib/agent/loop.js` — ramo `kind === 'read'`
- Modify: `src/lib/agent/context/dominio/admin.md`
- Test: `src/tests/unit/agent/loop.test.js` (caso novo)
- Test: `src/tests/unit/agent/dominioLint.test.js` (deve continuar verde)

**Interfaces:**
- Consumes: `result.arquivo` de qualquer tool `read` (hoje só `gerar_relatorio`)
- Produces: `emit({ type: 'file', token, filename, mime, bytes })` onde `bytes` é o **tamanho**, não o Buffer
- `messages` do tool result = `truncarResultado(JSON.stringify(result.data))` — **sem** `arquivo`

- [ ] **Step 1: Teste do emit**

Adicione ao fim de `loop.test.js`:

```js
it('tool de leitura com arquivo emite evento file e não coloca o token no histórico do modelo', async () => {
  const rel = await import('../../../lib/agent/tools/read/gerarRelatorio.js')
  const spy = vi.spyOn(rel.default, 'run').mockResolvedValue({
    data: { ok: true, filename: 'x.csv', formato: 'csv', secoes: [{ fonte: 'quem_nao_apontou', linhas: 1 }] },
    count: 1,
    arquivo: { token: 'tok-secreto', filename: 'x.csv', mime: 'text/csv', bytes: 12 },
  })
  const eventos = []
  const client = fakeClient([
    { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'gerar_relatorio', arguments: '{"titulo":"X","formato":"csv","fontes":[{"tool":"quem_nao_apontou","params":{"periodo":"hoje"}}]}' } }] } },
    { message: { role: 'assistant', content: 'gerei o csv' } },
  ])
  const { messages } = await runAgentTurn({
    client, profile: admin, model: 'x',
    messages: [{ role: 'user', content: 'me tira um csv' }],
    emit: (e) => eventos.push(e),
  })
  const fileEvt = eventos.find((e) => e.type === 'file')
  expect(fileEvt).toMatchObject({ token: 'tok-secreto', filename: 'x.csv', mime: 'text/csv', bytes: 12 })
  const toolMsg = messages.find((m) => m.role === 'tool')
  expect(toolMsg.content).not.toContain('tok-secreto')
  expect(toolMsg.content).toContain('x.csv')
  spy.mockRestore()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && npx vitest run tests/unit/agent/loop.test.js`
Expected: FAIL — nenhum evento `file`.

- [ ] **Step 3: Alterar o ramo read em `loop.js`**

No `else` de leitura (depois de `const result = await tool.run(...)`):

```js
if (result.arquivo) {
  const { token, filename, mime, bytes } = result.arquivo
  emit({ type: 'file', token, filename, mime, bytes })
}
auditAgentRead({ profile, tool: call.function.name, params: args, count: result.count })
messages.push({ role: 'tool', tool_call_id: call.id, content: truncarResultado(JSON.stringify(result.data)) })
```

Em `admin.md`, no bloco de inteligência de gestão:

```
- **gerar relatório em arquivo**: se pedirem Excel, PDF, CSV, Markdown
  baixável ou “me exporta”, chame `gerar_relatorio` com título, formato
  (`xlsx`/`pdf`/`csv`/`md`) e a lista de fontes (outras tools de leitura +
  params). Não cole o arquivo no texto e não invente linha — o sistema
  reexecuta as tools. Sem arquivo, continue respondendo em tabela no chat.
```

- [ ] **Step 4: Rodar testes**

Run: `cd src && npx vitest run tests/unit/agent/loop.test.js tests/unit/agent/dominioLint.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/loop.js src/lib/agent/context/dominio/admin.md src/tests/unit/agent/loop.test.js
git commit -m "feat(agente): loop emite evento file sem vazar token no histórico"
```

---

### Task 6: Front — evento `file` + botão Baixar

**Files:**
- Modify: `web/src/lib/agentClient.js` — `downloadAgentFile(token)`
- Modify: `web/src/lib/agentClient.test.js`
- Modify: `web/src/lib/agentSession.js` — `arquivo` da bolha **é** serializável (token/filename/mime); não descartar
- Modify: `web/src/lib/agentSession.test.js`
- Modify: `web/src/pages/AssistentePage.jsx`

**Interfaces:**
- Consumes: SSE `{ type: 'file', token, filename, mime, bytes }`
- Produces:
  - `downloadAgentFile(token) → Promise<void>` — `fetch(`${BASE_URL}/agent/downloads/${token}`)` com Bearer, se `!ok` lança `Error` com a mensagem do body (`arquivo expirado ou indisponível`) ou fallback; se ok, `blob()` + `<a download>`
  - Bolha do bot: `{ arquivo: { token, filename, mime, bytes } }`
  - Botão “Baixar {filename}”; 404 → texto na bolha “esse arquivo expirou, pede de novo”

- [ ] **Step 1: Testes do client e da sessão**

Em `agentClient.test.js`, acrescente:

```js
import { downloadAgentFile } from './agentClient'

it('downloadAgentFile manda Bearer e dispara o blob', async () => {
  const clicks = []
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = origCreate(tag)
    if (tag === 'a') el.click = () => clicks.push(el.download)
    return el
  })
  const origFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async () => new Response(new Blob(['abc']), {
    status: 200,
    headers: { 'Content-Disposition': 'attachment; filename="r.csv"', 'Content-Type': 'text/csv' },
  }))
  localStorage.setItem('access_token', 'tok')
  await downloadAgentFile('abc-token')
  expect(globalThis.fetch).toHaveBeenCalled()
  const [url, opts] = globalThis.fetch.mock.calls[0]
  expect(url).toMatch(/\/agent\/downloads\/abc-token$/)
  expect(opts.headers.Authorization).toBe('Bearer tok')
  expect(clicks).toContain('r.csv')
  globalThis.fetch = origFetch
})

it('downloadAgentFile em 404 lança a mensagem genérica', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'arquivo expirado ou indisponível' }), {
    status: 404, headers: { 'Content-Type': 'application/json' },
  }))
  localStorage.setItem('access_token', 'tok')
  await expect(downloadAgentFile('x')).rejects.toThrow(/expirado/i)
  globalThis.fetch = origFetch
})
```

Em `agentSession.test.js`:

```js
it('persiste o anexo de arquivo da bolha (token + filename)', () => {
  const mensagens = [
    { autor: 'bot', texto: 'gerei', arquivo: { token: 't', filename: 'r.csv', mime: 'text/csv', bytes: 3 } },
  ]
  salvarSessao('u-1', { conversationId: 'c', mensagens })
  expect(lerSessao('u-1').mensagens[0].arquivo.filename).toBe('r.csv')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/lib/agentClient.test.js src/lib/agentSession.test.js`
Expected: FAIL — `downloadAgentFile` ausente / `arquivo` perdido (se `limparNaoSerializaveis` o tirar — hoje não tira; o teste da sessão deve passar assim que o client existir; o do client falha).

- [ ] **Step 3: Implementar client + UI**

`downloadAgentFile`:

```js
export async function downloadAgentFile(token) {
  const auth = localStorage.getItem('access_token')
  const res = await fetch(`${BASE_URL}/agent/downloads/${encodeURIComponent(token)}`, {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  })
  if (!res.ok) throw new Error(await readErrorMessage(res, 'arquivo expirado ou indisponível'))
  const blob = await res.blob()
  const disp = res.headers.get('Content-Disposition') || ''
  const m = /filename="([^"]+)"/.exec(disp)
  const name = m?.[1] || 'relatorio'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
```

Em `receber` de `AssistentePage.jsx`:

```js
if (e.type === 'file') {
  setMensagens((m) => m.map((msg, i) => (
    i === idxBot ? { ...msg, arquivo: { token: e.token, filename: e.filename, mime: e.mime, bytes: e.bytes } } : msg
  )))
}
```

Na bolha do bot, abaixo do texto (mesmo espírito do bloco da proposta), um botão:

- label: `Baixar {arquivo.filename}`
- onClick: chama `downloadAgentFile`; em catch seta `msg.arquivoErro = err.message` (ou o texto fixo “esse arquivo expirou, pede de novo” se status/mensagem casar `/expirado/`)
- se `arquivoErro`, mostra o texto no lugar do botão (ou abaixo)

Estilo: `Button` existente do design system, variante secundária. Sem tela nova, sem preview.

- [ ] **Step 4: Rodar testes do front**

Run: `cd web && npx vitest run src/lib/agentClient.test.js src/lib/agentSession.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/agentClient.js web/src/lib/agentClient.test.js web/src/lib/agentSession.test.js web/src/pages/AssistentePage.jsx
git commit -m "feat(assistente): botão Baixar no evento file do chat"
```

---

## Self-review (cobertura do spec)

| Spec | Task |
|---|---|
| §3 extração + reexport SSRF | Task 1 |
| §3 tool, params, mapeamento, 31 dias, sem pessoa, `conectado` | Task 2 |
| §3.4 `core.md` | Task 2 |
| §3 paridade 4 papéis | Task 2 (`paridadePapel`) |
| §4 `gerar_relatorio`, fontes, tetos, 4 formatos, slug | Task 4 |
| §4.6/4.7 retorno sem bytes + `arquivo` | Task 4 + 5 |
| §4.8 `admin.md` | Task 5 |
| §5 downloads + GET + TTL + 10 MB + dono/papel | Task 3 |
| §5.3 UI + persistência + 404 | Task 6 |
| §5.4 `logReportGenerated` | Task 4 |
| §6 erros em português | Tasks 2–6 (mensagens fixadas nos testes) |
| §8.3 eval LLM / OAuth / Tigris | fora (sem task) |
