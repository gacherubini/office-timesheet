# Simulador de Performance + Remoção do Dark Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um simulador de performance (calendário mensal de horas por dia, com projeção de ganhos, salvo no servidor) na página de Performance do colaborador, tornar os painéis analíticos recolhíveis em modais, e remover o dark mode deixando só o tema claro.

**Architecture:** Backend Express + Postgres ganha uma tabela `performance_simulations` (uma linha por `user_id` + mês) e dois endpoints REST em `me.js`. O frontend React reaproveita o `/me/stats` já carregado na página (horas reais, valor/hora, meta) e sobrepõe as horas simuladas dos dias futuros, com autosave. A remoção do dark mode é uma limpeza mecânica de contexto/CSS/classes.

**Tech Stack:** Node.js/Express 5, Postgres (`pg`), Vitest + Supertest (testes de API), React/Vite, Tailwind CSS, lucide-react, react-router-dom.

## Global Constraints

- Todo texto de UI e mensagens de erro em **português (pt-BR)**.
- Datas/horas do domínio usam o fuso `America/Sao_Paulo` (o endpoint `/me/stats` já opera assim).
- Persistência de horas em **minutos inteiros** no banco; o frontend converte horas↔minutos na borda.
- Input de horas por dia: **decimal, faixa 0–24, passo 0,5**.
- Migração numerada sequencialmente: a próxima é `029_`.
- Seguir os padrões visuais existentes (classes Tailwind `text-text-primary`, `bg-surface`, `border-border-subtle`, componente `Modal` `size="lg"`, helpers `hm()`/`formatCurrency()` da própria PerformancePage).
- **Ordem de execução:** as Tarefas 4 e 5 (remoção do dark mode) devem rodar **por último**, depois que o agente que consolida Equipe→Pessoas terminar — senão as classes `dark:` que ele adicionar a `PessoasPage.jsx` reaparecem depois da limpeza. Nas Tarefas 1–3, **mantenha** as classes `dark:` no padrão atual do arquivo.
- Comandos de backend rodam a partir de `src/` (ex.: `cd src && npm run test:docker`). Comandos de frontend a partir de `web/` (ex.: `cd web && npm run build`).

---

## Task 1: Migração + endpoints `/me/simulation`

**Files:**
- Create: `src/migrations/029_performance_simulations.sql`
- Modify: `src/routes/me.js` (adicionar duas rotas perto da rota `/me/stats`)
- Test: `src/tests/integration/simulation.test.js`

**Interfaces:**
- Produces:
  - `GET /me/simulation?month=YYYY-MM` → `200 { month: string, planned: { [date: string]: number } }` (minutos por data; `{}` se não houver registro). `400` se `month` não casar `^\d{4}-\d{2}$`.
  - `PUT /me/simulation` body `{ month: string, planned: { [date: string]: number } }` → `200 { month, planned }` após upsert. `400` para `month` malformado, `planned` não-objeto, data fora do mês, ou minutos não-inteiros/fora de 0–1440. `401` sem token.
- Consumes: `requireAuth` (já em `../middleware/auth.js`, popula `req.profile.id`), `query` de `../lib/db.js`.

- [ ] **Step 1: Escrever o teste de integração (falhando)**

Criar `src/tests/integration/simulation.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { request } from '../helpers/api.js'

describe('/me/simulation — simulador de performance', () => {
  let employee
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
  })

  it('sem registro retorna planned vazio', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ month: '2026-08', planned: {} })
  })

  it('PUT persiste e GET seguinte devolve o mesmo mapa (upsert)', async () => {
    const planned = { '2026-08-10': 480, '2026-08-11': 300 }
    const put = await asUser(employee).put('/me/simulation').send({ month: '2026-08', planned })
    expect(put.status).toBe(200)
    expect(put.body.planned).toEqual(planned)

    const get = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get.body.planned).toEqual(planned)

    // Upsert: segundo PUT substitui o mapa inteiro.
    const planned2 = { '2026-08-12': 240 }
    await asUser(employee).put('/me/simulation').send({ month: '2026-08', planned: planned2 })
    const get2 = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get2.body.planned).toEqual(planned2)
  })

  it('GET com month malformado → 400', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-8')
    expect(res.status).toBe(400)
  })

  it('PUT com data fora do mês → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', planned: { '2026-09-01': 480 } })
    expect(res.status).toBe(400)
  })

  it('PUT com minutos fora de 0–1440 → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', planned: { '2026-08-10': 2000 } })
    expect(res.status).toBe(400)
  })

  it('exige autenticação', async () => {
    const res = await request.get('/me/simulation?month=2026-08')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd src && npm run test:docker -- tests/integration/simulation.test.js`
Expected: FALHA (rota inexistente → 404, e a tabela ainda não existe).

- [ ] **Step 3: Criar a migração**

Criar `src/migrations/029_performance_simulations.sql`:

```sql
-- 029_performance_simulations.sql
-- Simulador de performance: por (usuário, mês 'YYYY-MM'), guarda as horas
-- PLANEJADAS dos dias futuros, em minutos, num mapa jsonb { "YYYY-MM-DD": minutos }.
-- Horas reais nunca entram aqui — vêm sempre vivas de time_entries. Upsert por PK.

CREATE TABLE IF NOT EXISTS performance_simulations (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ym         text NOT NULL,
  planned    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ym)
);

DO $$ BEGIN
  CREATE TRIGGER performance_simulations_set_updated_at
    BEFORE UPDATE ON performance_simulations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Implementar as rotas**

Em `src/routes/me.js`, adicionar (perto da rota `router.get('/me/stats', ...)`):

```js
const YM_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

router.get('/me/simulation', requireAuth, async (req, res) => {
  const month = String(req.query.month || '')
  if (!YM_RE.test(month)) {
    return res.status(400).json({ error: 'Parâmetro "month" inválido. Use o formato YYYY-MM.' })
  }
  const { rows } = await query(
    'SELECT planned FROM performance_simulations WHERE user_id = $1 AND ym = $2',
    [req.profile.id, month]
  )
  return res.json({ month, planned: rows[0]?.planned || {} })
})

router.put('/me/simulation', requireAuth, async (req, res) => {
  const { month, planned } = req.body || {}
  if (!YM_RE.test(String(month || ''))) {
    return res.status(400).json({ error: 'Campo "month" inválido. Use o formato YYYY-MM.' })
  }
  if (planned === null || typeof planned !== 'object' || Array.isArray(planned)) {
    return res.status(400).json({ error: 'Campo "planned" deve ser um objeto de datas.' })
  }
  const clean = {}
  for (const [date, minutes] of Object.entries(planned)) {
    if (!DATE_RE.test(date) || date.slice(0, 7) !== month) {
      return res.status(400).json({ error: `Data fora do mês ${month}: ${date}.` })
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      return res.status(400).json({ error: `Minutos inválidos para ${date}: use um inteiro de 0 a 1440.` })
    }
    clean[date] = minutes
  }
  await query(
    `INSERT INTO performance_simulations (user_id, ym, planned)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, ym) DO UPDATE SET planned = EXCLUDED.planned, updated_at = now()`,
    [req.profile.id, month, JSON.stringify(clean)]
  )
  return res.json({ month, planned: clean })
})
```

Nota: `query` (pg) lança em erro e o Express 5 encaminha para o middleware de erro — não precisa de try/catch. `requireAuth` já garante 401 sem token e popula `req.profile.id`.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd src && npm run test:docker -- tests/integration/simulation.test.js`
Expected: PASSA (6 testes). O `globalSetup` aplica a migração 029 automaticamente no banco de teste.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/029_performance_simulations.sql src/routes/me.js src/tests/integration/simulation.test.js
git commit -m "feat(performance): endpoints e tabela para o simulador de horas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Componente `PerformanceSimulator` + integração na página

**Files:**
- Create: `web/src/components/PerformanceSimulator.jsx`
- Modify: `web/src/pages/PerformancePage.jsx` (renderizar o simulador no fim do `EmployeePerformancePage`)

**Interfaces:**
- Consumes: `api` (`web/src/lib/api.js`, tem `get`/`put`), `fetchHolidays(year)` (`web/src/lib/holidaysClient.js`), `Card`, helpers `hm()` e `formatCurrency()` (exportados de/duplicados na PerformancePage), objeto `stats` do `/me/stats` (traz `hourly_rate`, `monthly_income_goal`, `daily_totals` = `[{date, minutes}]`, `year`, `month`).
- Produces: `<PerformanceSimulator stats={stats} cursor={cursor} />` — bloco autônomo que carrega/salva `/me/simulation`.

**Regras de negócio (do spec):**
- Dias `≤ hoje`: travados, valor = horas reais de `daily_totals` (0 se ausente).
- Dias `> hoje`: editáveis; valor inicial = salvo (de `/me/simulation`, minutos→horas) ou seed **8h em dia útil**, **0** em fim de semana/feriado.
- Rodapé: horas reais acumuladas, horas simuladas (dias restantes), total, ganho projetado (`total × hourly_rate`), e comparação com `monthly_income_goal` (falta / % atingido) quando `> 0`.
- `hourly_rate === 0`: mostrar horas normalmente; ganho projetado como "—" / indisponível.
- Salva só os dias futuros (em minutos) via `PUT /me/simulation`, com **autosave debounce ~800ms** e indicador "Salvando…/Salvo".

- [ ] **Step 1: Criar o componente**

Criar `web/src/components/PerformanceSimulator.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { api } from '../lib/api'
import { fetchHolidays } from '../lib/holidaysClient'
import { Card } from './ui/Card'

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function todayYmd() {
  const n = new Date()
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate())
}
function hoursLabel(h) {
  if (!h) return '0h'
  return Number.isInteger(h) ? `${h}h` : `${h}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
}
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PerformanceSimulator({ stats, cursor }) {
  const { year, month } = cursor
  const hourlyRate = stats?.hourly_rate || 0
  const goal = stats?.monthly_income_goal || 0

  // Horas reais por data (minutos → horas), de daily_totals.
  const realHoursByDate = useMemo(() => {
    const m = {}
    for (const d of stats?.daily_totals || []) m[d.date] = (d.minutes || 0) / 60
    return m
  }, [stats])

  const [planned, setPlanned] = useState({}) // { date: horas } só dias futuros editados
  const [holidays, setHolidays] = useState(new Set())
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const monthParam = `${year}-${String(month).padStart(2, '0')}`
  const today = todayYmd()

  // Feriados do ano (cache no client).
  useEffect(() => {
    let alive = true
    fetchHolidays(year)
      .then((list) => { if (alive) setHolidays(new Set(list.map((h) => h.date))) })
      .catch(() => { if (alive) setHolidays(new Set()) })
    return () => { alive = false }
  }, [year])

  // Carrega o rascunho salvo (minutos → horas) ao trocar de mês.
  useEffect(() => {
    let alive = true
    api.get(`/me/simulation?month=${monthParam}`)
      .then((data) => {
        if (!alive) return
        const p = {}
        for (const [date, minutes] of Object.entries(data.planned || {})) p[date] = minutes / 60
        setPlanned(p)
      })
      .catch(() => { if (alive) setPlanned({}) })
    return () => { alive = false }
  }, [monthParam])

  const daysInMonth = new Date(year, month, 0).getDate()
  // Offset do 1º dia com semana começando na segunda (getDay: 0=dom).
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  function isWeekend(day) {
    const dow = new Date(year, month - 1, day).getDay()
    return dow === 0 || dow === 6
  }
  function isEditable(date) {
    return date > today
  }
  function seedHours(day, date) {
    if (isWeekend(day) || holidays.has(date)) return 0
    return 8
  }
  // Valor exibido de um dia: real (travado) ou planejado/seed (editável).
  function hoursFor(day) {
    const date = ymd(year, month, day)
    if (!isEditable(date)) return realHoursByDate[date] || 0
    if (date in planned) return planned[date]
    return seedHours(day, date)
  }

  const debounceRef = useRef(null)
  function scheduleSave(nextPlanned) {
    setSaveState('saving')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const payload = {}
      for (const [date, h] of Object.entries(nextPlanned)) payload[date] = Math.round(h * 60)
      try {
        await api.put('/me/simulation', { month: monthParam, planned: payload })
        setSaveState('saved')
      } catch {
        setSaveState('idle')
      }
    }, 800)
  }

  function setDayHours(day, raw) {
    const date = ymd(year, month, day)
    let h = Number(raw)
    if (Number.isNaN(h)) h = 0
    h = Math.max(0, Math.min(24, h))
    const next = { ...planned, [date]: h }
    setPlanned(next)
    scheduleSave(next)
  }

  // Totais: dias ≤ hoje usam real; > hoje usam planejado/seed.
  const totals = useMemo(() => {
    let real = 0
    let sim = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const date = ymd(year, month, day)
      if (isEditable(date)) sim += hoursFor(day)
      else real += realHoursByDate[date] || 0
    }
    return { real, sim, total: real + sim }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysInMonth, year, month, planned, holidays, realHoursByDate, today])

  const projected = hourlyRate > 0 ? totals.total * hourlyRate : null
  const remaining = goal > 0 && projected !== null ? Math.max(0, goal - projected) : null
  const goalPct = goal > 0 && projected !== null ? Math.min(100, Math.round((projected / goal) * 100)) : null

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-text-secondary" />
          <h2 className="text-[15px] font-semibold text-text-primary">Simulador de performance</h2>
        </div>
        <span className="text-xs text-text-secondary">
          {saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvo' : ''}
        </span>
      </div>

      <p className="text-[13px] text-text-secondary mb-3">
        Dias já passados mostram suas horas reais. Nos dias que faltam, ajuste quantas horas
        pretende trabalhar para ver o ganho projetado.
      </p>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] uppercase tracking-wide text-text-secondary py-1">
            {w}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} />
          const date = ymd(year, month, day)
          const editable = isEditable(date)
          const isToday = date === today
          const value = hoursFor(day)
          return (
            <div
              key={date}
              className={`rounded-lg border p-1.5 min-h-[58px] flex flex-col ${
                isToday ? 'border-[color:var(--color-accent)]' : 'border-border-subtle'
              } ${editable ? 'bg-surface' : 'bg-surface-alt'}`}
            >
              <span className="text-[11px] text-text-secondary tabular-nums">{day}</span>
              {editable ? (
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={value}
                  onChange={(e) => setDayHours(day, e.target.value)}
                  aria-label={`Horas em ${date}`}
                  className="form-control mt-auto w-full rounded-md border px-1 py-0.5 text-sm text-right tabular-nums outline-none"
                />
              ) : (
                <span className="mt-auto text-sm text-right tabular-nums text-text-primary">
                  {hoursLabel(value)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border-subtle">
        <div>
          <p className="text-xs text-text-secondary">Horas reais</p>
          <p className="font-display text-xl tabular-nums text-text-primary">{hoursLabel(totals.real)}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Horas simuladas</p>
          <p className="font-display text-xl tabular-nums text-text-primary">{hoursLabel(totals.sim)}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Total de horas</p>
          <p className="font-display text-xl tabular-nums text-text-primary">{hoursLabel(totals.total)}</p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Ganho projetado</p>
          <p className="font-display text-xl tabular-nums text-emerald-600 dark:text-emerald-400">
            {projected === null ? '—' : formatCurrency(projected)}
          </p>
        </div>
      </div>

      {goal > 0 && projected !== null && (
        <div className="mt-3 rounded-lg bg-surface-alt p-3 text-[13px] text-text-secondary">
          Meta do mês: {formatCurrency(goal)} · {goalPct}% atingido ·{' '}
          {remaining > 0 ? `faltam ${formatCurrency(remaining)}` : 'meta alcançada 🎉'}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Renderizar o simulador na página**

Em `web/src/pages/PerformancePage.jsx`:
- No topo, adicionar o import: `import { PerformanceSimulator } from '../components/PerformanceSimulator'`.
- No `EmployeePerformancePage`, logo **abaixo** do `<HistoryStrip ... />` (fim do JSX, antes do `</div>` final), adicionar:

```jsx
      <div className="mt-4">
        <PerformanceSimulator stats={stats} cursor={cursor} />
      </div>
```

- [ ] **Step 3: Validar o build**

Run: `cd web && npm run build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/PerformanceSimulator.jsx web/src/pages/PerformancePage.jsx
git commit -m "feat(performance): simulador de horas por dia com projeção de ganhos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Painéis analíticos recolhíveis em modais

**Files:**
- Modify: `web/src/pages/PerformancePage.jsx`

**Interfaces:**
- Consumes: `Modal` de `../components/ui/Modal` (`size="lg"`, `title`, `open`, `onClose`), componentes internos existentes `HoursByProject`, `TaskTypesPanel`, `HistoryStrip`.
- Produces: uma faixa compacta de 3 cartões que abrem cada painel num `Modal` sobreposto ao simulador.

**Objetivo (do spec):** os três painéis — **Horas por projeto**, **Tipos de tarefa mais feitas**, **Histórico — últimos meses** — deixam de ocupar a página e viram **cartões compactos** (grid de 3 colunas) com título + ícone + uma linha de resumo. Clicar abre o painel completo **na frente** (Modal). Só um modal por vez.

- [ ] **Step 1: Extrair o corpo de cada painel do `<Card>` externo**

Em `web/src/pages/PerformancePage.jsx`, refatorar `HoursByProject`, `TaskTypesPanel` e `HistoryStrip` para que o conteúdo interno (sem o `<Card>` externo e sem o cabeçalho de título, que passa a viver no `Modal`/no cartão compacto) fique num sub-componente reutilizável. Padrão para cada um (exemplo com projetos):

```jsx
// Corpo puro (sem Card/título) — usado dentro do Modal.
function HoursByProjectBody({ breakdown, loading }) {
  const rows = useMemo(() => { /* … mesma lógica de rows já existente … */ }, [breakdown])
  const max = rows.reduce((m, r) => Math.max(m, r.minutes), 0) || 1
  if (loading) return <p className="text-sm text-text-secondary py-6 text-center">Carregando...</p>
  if (rows.length === 0) return <p className="text-sm text-text-secondary py-6 text-center">Nenhuma hora registrada neste mês.</p>
  return (
    <div className="space-y-3.5">
      {/* … mesmo map de barras já existente … */}
    </div>
  )
}
```

Fazer o equivalente `TaskTypesBody` e `HistoryBody` movendo o miolo atual de cada componente para o `*Body`. (Reaproveite exatamente a lógica de `rows`/`max`/`map` que já existe hoje em cada um — apenas mova para o `*Body`.)

- [ ] **Step 2: Criar o cartão compacto genérico e a faixa**

Adicionar ao arquivo:

```jsx
import { CalendarClock } from 'lucide-react' // (se ainda não importado no arquivo)

function CollapsiblePanelCard({ icon: Icon, title, summary, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-[color:var(--color-accent)]/40 hover:bg-surface-alt transition-colors w-full"
    >
      <span className="w-9 h-9 rounded-lg bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center flex-none">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-text-primary text-sm truncate">{title}</span>
        <span className="block text-[12px] text-text-secondary truncate">{summary}</span>
      </span>
      <ChevronRight size={16} className="ml-auto text-text-secondary group-hover:translate-x-0.5 transition-transform flex-none" />
    </button>
  )
}
```

- [ ] **Step 3: Trocar os três painéis abertos por faixa + modal no `EmployeePerformancePage`**

Adicionar estado no `EmployeePerformancePage`: `const [openPanel, setOpenPanel] = useState(null)` (valores: `'projetos' | 'tarefas' | 'historico' | null`).

Substituir o bloco atual:

```jsx
      <div className="grid lg:grid-cols-2 gap-3 mb-4">
        <HoursByProject breakdown={stats?.project_breakdown} loading={loading} />
        <TaskTypesPanel breakdown={stats?.task_type_breakdown} loading={loading} />
      </div>

      <HistoryStrip history={history} loading={historyLoading} />
```

por:

```jsx
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <CollapsiblePanelCard
          icon={FolderKanban}
          title="Horas por projeto"
          summary={loading ? 'Carregando…' : `${(stats?.project_breakdown || []).length} projeto(s)`}
          onOpen={() => setOpenPanel('projetos')}
        />
        <CollapsiblePanelCard
          icon={ListChecks}
          title="Tipos de tarefa mais feitas"
          summary={loading ? 'Carregando…' : `${(stats?.task_type_breakdown || []).length} etapa(s)`}
          onOpen={() => setOpenPanel('tarefas')}
        />
        <CollapsiblePanelCard
          icon={FileText}
          title="Histórico — últimos meses"
          summary={historyLoading ? 'Carregando…' : `${(history || []).length} mês(es)`}
          onOpen={() => setOpenPanel('historico')}
        />
      </div>

      <Modal open={openPanel === 'projetos'} onClose={() => setOpenPanel(null)} size="lg" title="Horas por projeto">
        <HoursByProjectBody breakdown={stats?.project_breakdown} loading={loading} />
      </Modal>
      <Modal open={openPanel === 'tarefas'} onClose={() => setOpenPanel(null)} size="lg" title="Tipos de tarefa mais feitas">
        <TaskTypesBody breakdown={stats?.task_type_breakdown} loading={loading} />
      </Modal>
      <Modal open={openPanel === 'historico'} onClose={() => setOpenPanel(null)} size="lg" title="Histórico — últimos meses">
        <HistoryBody history={history} loading={historyLoading} />
      </Modal>
```

Garantir os imports usados: `Modal` de `../components/ui/Modal`, e os ícones `FolderKanban`, `ListChecks`, `FileText`, `ChevronRight` (já importados de `lucide-react` no arquivo). Remover os componentes `HoursByProject`/`TaskTypesPanel`/`HistoryStrip` antigos se ficarem sem uso (o miolo agora vive nos `*Body`), ou mantê-los apenas se ainda referenciados — não deixar componente morto.

- [ ] **Step 4: Validar o build**

Run: `cd web && npm run build`
Expected: build sem erros. Sem imports/variáveis não usados.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/PerformancePage.jsx
git commit -m "feat(performance): painéis analíticos recolhíveis em modais

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Remover ThemeContext, provider e o botão de tema

> **Executar só depois** que o agente Equipe→Pessoas terminar (ver Global Constraints).

**Files:**
- Delete: `web/src/contexts/ThemeContext.jsx`
- Modify: `web/src/main.jsx`, `web/src/components/Layout.jsx`

- [ ] **Step 1: Remover o `ThemeProvider` do `main.jsx`**

Em `web/src/main.jsx`: remover a linha `import { ThemeProvider } from './contexts/ThemeContext'` e desembrulhar o `<ThemeProvider>…</ThemeProvider>`, deixando `<BrowserRouter>` como filho direto de `<React.StrictMode>`.

- [ ] **Step 2: Remover o toggle de tema do `Layout.jsx`**

Em `web/src/components/Layout.jsx`:
- Remover `import { useTheme } from '../contexts/ThemeContext'`.
- Remover a linha `const { isDark, toggleTheme } = useTheme()`.
- Remover o `<button onClick={toggleTheme} …>` inteiro (o que alterna Sol/Lua, ~linhas 247–257).
- Remover `Sun` e `Moon` do import de `lucide-react` (se não usados em outro lugar do arquivo — confirmar com grep).

- [ ] **Step 3: Deletar o arquivo do contexto**

```bash
rm web/src/contexts/ThemeContext.jsx
```

- [ ] **Step 4: Validar o build e ausência de referências**

Run:
```bash
cd web && npm run build
grep -rn "useTheme\|ThemeContext\|ThemeProvider\|gestao-void-theme" src
```
Expected: build sem erros; grep retorna vazio.

- [ ] **Step 5: Commit**

```bash
git add web/src/main.jsx web/src/components/Layout.jsx web/src/contexts/ThemeContext.jsx
git commit -m "refactor(theme): remover contexto de tema e o botão de alternância

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Remover o CSS `.dark` e todas as classes `dark:`

> **Executar por último.** Depende da Tarefa 4 e do término do agente Equipe→Pessoas.

**Files:**
- Modify: `web/src/index.css` e todos os arquivos em `web/src` que contêm `dark:` (~29 arquivos).

- [ ] **Step 1: Remover o bloco `.dark` do CSS**

Em `web/src/index.css`:
- Remover o bloco inteiro `.dark { … }` (as variáveis de tema dark, ~linhas 38–63).
- Remover a regra `.dark .form-control::-webkit-calendar-picker-indicator { … }`.
- Manter o `:root { … }` (já é `color-scheme: light`) e todo o resto.

- [ ] **Step 2: Remover todas as classes utilitárias `dark:`**

Rodar o script que remove os tokens `dark:…` das `className` em todo `web/src` (inclui variantes como `dark:hover:bg-white/5`):

```bash
cd web
grep -rl "dark:" src | while read -r f; do
  perl -i -pe 's/\s*\bdark:[^\s"'"'"'`]+//g' "$f"
done
```

- [ ] **Step 3: Normalizar espaços duplos residuais em `className` (cosmético)**

```bash
cd web
grep -rl "  " src >/dev/null 2>&1 || true
# Revisar manualmente diffs onde a remoção deixou dois espaços seguidos dentro de className e ajustar.
```
(Não é obrigatório para funcionar; apenas mantém o diff limpo. Priorize os arquivos com mais alterações.)

- [ ] **Step 4: Validar**

Run:
```bash
cd web && npm run build
grep -rn "dark:" src
```
Expected: build sem erros; `grep` retorna **vazio**.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "refactor(theme): remover estilos e classes dark, deixando só o tema claro

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (feita na escrita)

- **Cobertura do spec:** Parte 1 → Tarefas 1 (persistência/endpoints), 2 (calendário/seed/autosave/projeção/meta), 3 (painéis recolhíveis em modal). Parte 2 → Tarefas 4 (contexto/provider/toggle) e 5 (CSS `.dark` + classes `dark:`). Testes de API cobertos na Tarefa 1 (sem registro, upsert, month malformado, data fora do mês, minutos fora de faixa, 401).
- **Placeholders:** nenhum "TBD/TODO"; a Tarefa 3 reaproveita lógica já existente e indica exatamente o que mover para os `*Body`.
- **Consistência de tipos:** `planned` é sempre `{ date: minutos(int) }` no backend/API; o frontend converte para horas na borda (`/60` na leitura, `*60` no PUT). `cursor = { year, month }` casa com o uso na PerformancePage. `saveState ∈ {idle,saving,saved}`, `openPanel ∈ {projetos,tarefas,historico,null}`.
- **Ordem:** Tarefas 4–5 explicitamente após o agente Equipe→Pessoas para não recriar classes `dark:`.
