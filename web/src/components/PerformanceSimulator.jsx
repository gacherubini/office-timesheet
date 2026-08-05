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
