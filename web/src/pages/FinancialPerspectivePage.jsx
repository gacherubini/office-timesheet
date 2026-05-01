import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Save, Target } from 'lucide-react'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDuration(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${h}h ${m}m`
}

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isBusinessDay(date) {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

function buildMonthCalendar(stats) {
  if (!stats?.year || !stats?.month) return []

  const firstDay = new Date(stats.year, stats.month - 1, 1)
  const lastDay = new Date(stats.year, stats.month, 0)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  const end = new Date(lastDay)
  end.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const dailyMap = new Map((stats.daily_totals || []).map((item) => [item.date, item.minutes]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const remainingBusinessDays = []
  for (let d = new Date(today); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d.getMonth() === stats.month - 1 && isBusinessDay(d)) {
      remainingBusinessDays.push(dateKey(d))
    }
  }

  const requiredPerRemainingDay = remainingBusinessDays.length > 0
    ? Math.ceil((stats.remaining_goal_minutes || 0) / remainingBusinessDays.length)
    : 0

  const days = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d)
    const inMonth = d.getMonth() === stats.month - 1
    const businessDay = isBusinessDay(d)
    const isFutureTarget = inMonth && businessDay && key >= dateKey(today)

    days.push({
      key,
      day: d.getDate(),
      inMonth,
      businessDay,
      workedMinutes: dailyMap.get(key) || 0,
      requiredMinutes: isFutureTarget ? requiredPerRemainingDay : 0,
      isToday: key === dateKey(today),
    })
  }

  return days
}

function MetricCard({ label, value, detail }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary">
        {label}
      </p>
      <p className="font-display text-2xl text-text-primary tabular-nums mt-2">{value}</p>
      {detail && <p className="text-xs text-text-secondary mt-1">{detail}</p>}
    </Card>
  )
}

export function FinancialPerspectivePage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function loadStats() {
    setLoading(true)
    api
      .get('/me/stats')
      .then((data) => {
        setStats(data)
        setGoalInput(data.monthly_income_goal ? String(data.monthly_income_goal) : '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStats()
  }, [])

  async function handleSaveGoal(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const goal = Number(goalInput) || 0
      await api.put('/me/profile', { monthly_income_goal: goal })
      loadStats()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const goalPct = stats?.goal_amount_pct ?? 0
  const calendarDays = buildMonthCalendar(stats)
  const remainingBusinessDays = calendarDays.filter((day) => day.requiredMinutes > 0).length

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Perspectiva Financeira"
        subtitle="Defina quanto quer receber no mês e acompanhe quanto precisa trabalhar"
      />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <Card className="mb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center">
            <Target size={20} />
          </div>
          <div>
            <h2 className="font-display text-xl text-text-primary">Meta mensal</h2>
            <p className="text-sm text-text-secondary">
              O cálculo usa seu valor/hora atual e seus apontamentos concluídos no mês.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveGoal} className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Quero receber no mês
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="0,00"
              className="w-full form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            />
          </div>
          <Button type="submit" disabled={saving} className="self-end">
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Meta'}
          </Button>
        </form>

        <div className="h-3 rounded-full bg-surface-alt overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, goalPct)}%`,
              background: 'var(--color-accent)',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-sm text-text-secondary">
          <span>{loading ? '...' : `${goalPct}% da meta atual`}</span>
          <span>{formatCurrency(stats?.monthly_income_goal || 0)}</span>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <MetricCard
          label="Saldo do mês"
          value={loading ? '—' : formatCurrency(stats?.total_cost)}
          detail="Apontamentos concluídos"
        />
        <MetricCard
          label="Falta atingir"
          value={loading ? '—' : formatCurrency(stats?.remaining_goal_amount)}
          detail="Valor restante para a meta"
        />
        <MetricCard
          label="Precisa trabalhar"
          value={loading ? '—' : formatDuration(stats?.remaining_goal_minutes)}
          detail={`Valor/hora: ${formatCurrency(stats?.hourly_rate)}`}
        />
        <MetricCard
          label="Projeção final"
          value={loading ? '—' : formatCurrency(stats?.projected_monthly_income)}
          detail={`${stats?.working_days ?? 0} dia(s) trabalhado(s)`}
        />
      </div>

      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-xl text-text-primary">Calendário da meta</h2>
            <p className="text-sm text-text-secondary">
              Horas trabalhadas por dia e ritmo necessário nos dias úteis restantes.
            </p>
          </div>
          <div className="text-sm text-text-secondary">
            {remainingBusinessDays > 0
              ? `${formatDuration(stats?.remaining_goal_minutes)} em ${remainingBusinessDays} dia(s) úteis`
              : 'Nenhum dia útil restante'}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day) => (
            <div
              key={day}
              className="text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary py-1"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {loading ? (
            <div className="col-span-7 text-sm text-text-secondary text-center py-8">
              Carregando calendário...
            </div>
          ) : (
            calendarDays.map((day) => (
              <div
                key={day.key}
                className={`min-h-24 rounded-lg border p-2 transition-colors ${
                  day.inMonth
                    ? 'border-border-subtle bg-surface'
                    : 'border-border-subtle bg-surface-alt opacity-50'
                } ${day.isToday ? 'ring-1 ring-[color:var(--color-accent)]' : ''}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-medium ${day.inMonth ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {day.day}
                  </span>
                  {!day.businessDay && day.inMonth && (
                    <span className="text-[10px] text-text-secondary">fim</span>
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <p className="text-[11px] text-text-secondary">Trabalhado</p>
                  <p className="text-sm font-semibold text-text-primary tabular-nums">
                    {formatDuration(day.workedMinutes)}
                  </p>

                  {day.requiredMinutes > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] text-text-secondary">Necessário</p>
                      <p className="text-sm font-semibold text-accent tabular-nums">
                        {formatDuration(day.requiredMinutes)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle bg-surface-alt">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Detalhamento por projeto
          </h2>
        </div>
        <div className="divide-y divide-border-subtle">
          {loading ? (
            <p className="text-sm text-text-secondary text-center py-6">Carregando...</p>
          ) : (stats?.project_breakdown ?? []).length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-6">
              Nenhum projeto trabalhado no mês.
            </p>
          ) : (
            stats.project_breakdown.map((project) => (
              <div key={project.project_id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {project.project_name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Hoje: {formatDuration(project.today_minutes)}
                  </p>
                </div>
                <p className="text-sm font-medium text-text-primary tabular-nums">
                  {formatDuration(project.total_minutes)}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
