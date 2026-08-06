import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { fetchHolidays } from '../lib/holidaysClient'
import { Card } from './ui/Card'

const WEEKDAY_LABELS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

const DEFAULT_CONFIG = {
  target_amount: 0,
  include_weekends: false,
  weekend_default_minutes: 240,
  overrides: {},
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
// "Hoje" no fuso do domínio (America/Sao_Paulo), para casar com o resto da página.
function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function hoursLabel(h) {
  const totalMin = Math.round((h || 0) * 60)
  const hrs = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return min ? `${hrs}h${String(min).padStart(2, '0')}` : `${hrs}h`
}
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
// Aceita o que o usuário digita (com R$, pontos de milhar, vírgula decimal).
function parseAmount(raw) {
  const cleaned = String(raw).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
function parseHours(raw) {
  if (raw === '' || raw == null) return 0
  const n = Number(String(raw).replace(',', '.'))
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(24, n))
}

export function PerformanceSimulator({ stats, cursor }) {
  const { year, month } = cursor
  const rate = stats?.hourly_rate || 0
  const monthParam = `${year}-${String(month).padStart(2, '0')}`
  const today = todayYmd()

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [targetDraft, setTargetDraft] = useState('') // texto exato do campo de meta
  const [weekendDraft, setWeekendDraft] = useState('') // texto do "padrão por dia de FDS"
  const [overrideDrafts, setOverrideDrafts] = useState({}) // date -> texto do input daquele FDS
  const [holidays, setHolidays] = useState(new Set())
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved

  // Horas reais por data (minutos → horas), de daily_totals.
  const realHoursByDate = useMemo(() => {
    const m = {}
    for (const d of stats?.daily_totals || []) m[d.date] = (d.minutes || 0) / 60
    return m
  }, [stats])

  useEffect(() => {
    let alive = true
    fetchHolidays(year)
      .then((list) => { if (alive) setHolidays(new Set(list.map((h) => h.date))) })
      .catch(() => { if (alive) setHolidays(new Set()) })
    return () => { alive = false }
  }, [year])

  // Carrega a config salva ao trocar de mês.
  useEffect(() => {
    let alive = true
    api.get(`/me/simulation?month=${monthParam}`)
      .then((data) => {
        if (!alive) return
        const c = { ...DEFAULT_CONFIG, ...(data.config || {}) }
        setConfig(c)
        setTargetDraft(c.target_amount ? String(c.target_amount) : '')
        setWeekendDraft(String((c.weekend_default_minutes || 0) / 60))
        setOverrideDrafts({})
      })
      .catch(() => {
        if (!alive) return
        setConfig(DEFAULT_CONFIG)
        setTargetDraft('')
        setWeekendDraft('4')
        setOverrideDrafts({})
      })
    return () => { alive = false }
  }, [monthParam])

  const debounceRef = useRef(null)
  useEffect(() => () => clearTimeout(debounceRef.current), [])
  function persist(next) {
    setSaveState('saving')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await api.put('/me/simulation', { month: monthParam, config: next })
        setSaveState('saved')
      } catch {
        setSaveState('idle')
      }
    }, 700)
  }
  function updateConfig(patch) {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7 // semana começa na segunda

  function dowOf(day) {
    return new Date(year, month - 1, day).getDay() // 0=dom … 6=sáb
  }
  function isWeekendDay(day) {
    const d = dowOf(day)
    return d === 0 || d === 6
  }

  // Classifica cada dia e monta o modelo do mês.
  const model = useMemo(() => {
    const realHours = Object.entries(realHoursByDate)
      .filter(([date]) => date.slice(0, 7) === monthParam && date <= today)
      .reduce((s, [, h]) => s + h, 0)
    const realAmount = realHours * rate

    // Dias úteis futuros (não feriado) recebem a distribuição da meta.
    const futureWeekdays = []
    const futureWeekends = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = ymd(year, month, day)
      if (date <= today) continue
      if (isWeekendDay(day)) futureWeekends.push({ day, date })
      else if (!holidays.has(date)) futureWeekdays.push({ day, date })
    }

    const remainingAmount = Math.max(0, config.target_amount - realAmount)
    const remainingHours = rate > 0 ? remainingAmount / rate : 0
    const perWeekday = futureWeekdays.length > 0 ? remainingHours / futureWeekdays.length : 0

    function weekendHours(date) {
      if (date in config.overrides) return config.overrides[date] / 60
      return config.include_weekends ? config.weekend_default_minutes / 60 : 0
    }

    const weekdayHours = perWeekday * futureWeekdays.length
    const weekendTotal = futureWeekends.reduce((s, { date }) => s + weekendHours(date), 0)
    const totalHours = realHours + weekdayHours + weekendTotal
    const projected = totalHours * rate
    const weekendAmount = weekendTotal * rate

    return {
      realHours,
      perWeekday,
      weekdayCount: futureWeekdays.length,
      weekendTotal,
      weekendAmount,
      totalHours,
      projected,
      weekendHoursFor: weekendHours,
    }
  }, [realHoursByDate, monthParam, today, rate, daysInMonth, year, month, holidays, config])

  function setWeekendOverride(date, raw) {
    setOverrideDrafts((prev) => ({ ...prev, [date]: raw }))
    const overrides = { ...config.overrides, [date]: Math.round(parseHours(raw) * 60) }
    updateConfig({ overrides })
  }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const noTarget = config.target_amount <= 0
  const noRate = rate <= 0

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-text-secondary" />
          <h2 className="text-[15px] font-semibold text-text-primary">Simulador de performance</h2>
        </div>
        <span className="text-xs text-text-secondary tabular-nums">
          {saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvo' : ''}
        </span>
      </div>
      <p className="text-[13px] text-text-secondary mb-4">
        Diga quanto quer ganhar no mês e o calendário se preenche sozinho nos dias úteis que faltam.
        Ative os fins de semana para lançar hora extra.
      </p>

      {/* Painel-meta: o coração do simulador. */}
      <div className="rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/[0.06] p-4 mb-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary mb-1">
              Meta de ganho no mês
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-2xl text-text-secondary">R$</span>
              <input
                inputMode="decimal"
                value={targetDraft}
                onChange={(e) => {
                  setTargetDraft(e.target.value)
                  updateConfig({ target_amount: parseAmount(e.target.value) })
                }}
                placeholder="0"
                aria-label="Meta de ganho no mês em reais"
                className="w-40 bg-transparent font-display text-3xl text-text-primary tabular-nums outline-none placeholder:text-text-secondary/40"
              />
            </div>
          </label>

          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Sparkles size={15} className="text-accent" />
            {noRate ? (
              <span>Defina seu valor/hora para projetar o ganho.</span>
            ) : noTarget ? (
              <span>Digite a meta para distribuir as horas.</span>
            ) : model.weekdayCount > 0 ? (
              <span>
                <strong className="font-semibold text-text-primary tabular-nums">{hoursLabel(model.perWeekday)}</strong>{' '}
                por dia útil · {model.weekdayCount} {model.weekdayCount === 1 ? 'dia' : 'dias'} restantes
              </span>
            ) : (
              <span>Sem dias úteis restantes no mês para distribuir.</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[color:var(--color-accent)]/15 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={config.include_weekends}
              onChange={(e) => updateConfig({ include_weekends: e.target.checked })}
              className="h-4 w-4 rounded border-border-subtle accent-[color:var(--color-accent-2)]"
            />
            Incluir fins de semana <span className="text-text-secondary">(hora extra)</span>
          </label>
          {config.include_weekends && (
            <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
              Padrão por sáb/dom
              <input
                inputMode="decimal"
                value={weekendDraft}
                onChange={(e) => {
                  setWeekendDraft(e.target.value)
                  updateConfig({ weekend_default_minutes: Math.round(parseHours(e.target.value) * 60) })
                }}
                aria-label="Horas padrão por dia de fim de semana"
                className="w-14 rounded-md border border-border-subtle bg-surface px-2 py-1 text-right text-sm text-text-primary tabular-nums outline-none focus:border-[color:var(--color-accent-2)]"
              />
              h
            </label>
          )}
        </div>
      </div>

      {/* Calendário */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] uppercase tracking-wide py-1 ${
              i >= 5 ? 'text-[color:var(--color-accent-2)]' : 'text-text-secondary'
            }`}
          >
            {w}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} />
          const date = ymd(year, month, day)
          const past = date <= today
          const isToday = date === today
          const weekend = isWeekendDay(day)
          const holiday = holidays.has(date)

          // Determina o valor e o estilo do dia.
          let content
          let cellClass = 'border-border-subtle bg-surface'
          if (past) {
            cellClass = 'border-border-subtle bg-surface-alt'
            content = (
              <span className="mt-auto text-sm text-right tabular-nums text-text-secondary">
                {hoursLabel(realHoursByDate[date] || 0)}
              </span>
            )
          } else if (weekend) {
            const active = config.include_weekends || date in config.overrides
            cellClass = active
              ? 'border-[color:var(--color-accent-2)]/40 bg-[color:var(--color-accent-2)]/[0.08]'
              : 'border-border-subtle bg-surface-alt/60'
            const shown = date in overrideDrafts ? overrideDrafts[date] : String(model.weekendHoursFor(date))
            content = (
              <input
                inputMode="decimal"
                value={shown}
                onChange={(e) => setWeekendOverride(date, e.target.value)}
                aria-label={`Horas extras em ${date}`}
                className={`mt-auto w-full bg-transparent text-right text-sm tabular-nums outline-none ${
                  active ? 'text-[color:var(--color-accent-2)] font-medium' : 'text-text-secondary/60'
                }`}
              />
            )
          } else if (holiday) {
            content = (
              <span className="mt-auto text-right text-[11px] text-text-secondary/70">feriado</span>
            )
          } else {
            content = (
              <span className="mt-auto text-sm text-right tabular-nums text-accent font-medium">
                {noTarget ? '—' : hoursLabel(model.perWeekday)}
              </span>
            )
          }

          return (
            <div
              key={date}
              className={`rounded-lg border p-1.5 min-h-[56px] flex flex-col transition-colors ${cellClass} ${
                isToday ? 'ring-1 ring-[color:var(--color-accent)] border-[color:var(--color-accent)]' : ''
              }`}
            >
              <span className="text-[11px] text-text-secondary tabular-nums leading-none">{day}</span>
              {content}
            </div>
          )
        })}
      </div>

      {/* Rodapé de resultados */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border-subtle">
        <div>
          <p className="text-xs text-text-secondary">Horas no mês</p>
          <p className="font-display text-xl tabular-nums text-text-primary">{hoursLabel(model.totalHours)}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {hoursLabel(model.realHours)} reais + simulado
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Por dia útil</p>
          <p className="font-display text-xl tabular-nums text-text-primary">
            {noTarget ? '—' : hoursLabel(model.perWeekday)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary">Extra fim de semana</p>
          <p className="font-display text-xl tabular-nums text-[color:var(--color-accent-2)]">
            {hoursLabel(model.weekendTotal)}
          </p>
          {model.weekendAmount > 0 && (
            <p className="text-[11px] text-text-secondary mt-0.5">+{formatCurrency(model.weekendAmount)}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-text-secondary">Ganho projetado</p>
          <p className="font-display text-xl tabular-nums text-emerald-600">
            {noRate ? '—' : formatCurrency(model.projected)}
          </p>
          {!noRate && !noTarget && (
            <p className="text-[11px] text-text-secondary mt-0.5">
              meta {formatCurrency(config.target_amount)}
              {model.weekendAmount > 0 ? ' + extra' : ''}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
