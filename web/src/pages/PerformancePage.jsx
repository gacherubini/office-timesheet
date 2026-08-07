import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  ListChecks,
  BarChart3,
  FileText,
  Gift,
  Receipt,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { PerformanceSimulator } from '../components/PerformanceSimulator'

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Minutos -> "132h" (exato) ou "7h20" (com minutos).
function hm(minutes) {
  const total = Math.round(minutes || 0)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

// KPI card. `highlight` pinta o destaque (verde) do "A receber no mês".
function Kpi({ label, value, detail, highlight = false }) {
  return (
    <Card
      style={
        highlight
          ? {
              backgroundColor: 'color-mix(in srgb, var(--state-success) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--state-success) 30%, transparent)',
            }
          : undefined
      }
    >
      <p className={`text-[13px] font-medium ${highlight ? 'state-success' : 'text-text-secondary'}`}>
        {label}
      </p>
      <p className={`font-display text-[28px] leading-none tabular-nums mt-2 ${highlight ? 'state-success' : 'text-text-primary'}`}>
        {value}
      </p>
      {detail && (
        <p
          className={`text-xs mt-1.5 ${highlight ? '' : 'text-text-secondary'}`}
          style={highlight ? { color: 'color-mix(in srgb, var(--state-success) 70%, transparent)' } : undefined}
        >
          {detail}
        </p>
      )}
    </Card>
  )
}

// Corpo puro (sem Card/título) — usado dentro do Modal.
// Lista de barras horizontais (horas por projeto). `top` limita e agrupa o resto em "Outros".
function HoursByProjectBody({ breakdown, loading }) {
  const rows = useMemo(() => {
    const items = [...(breakdown || [])]
      .map((p) => ({ name: p.project_name || 'Sem projeto', minutes: p.total_minutes || 0 }))
      .filter((p) => p.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)

    const TOP = 4
    if (items.length <= TOP + 1) return items
    const top = items.slice(0, TOP)
    const restMinutes = items.slice(TOP).reduce((s, p) => s + p.minutes, 0)
    if (restMinutes > 0) top.push({ name: 'Outros', minutes: restMinutes, muted: true })
    return top
  }, [breakdown])

  const max = rows.reduce((m, r) => Math.max(m, r.minutes), 0) || 1

  if (loading) return <p className="text-sm text-text-secondary py-6 text-center">Carregando...</p>
  if (rows.length === 0) return <p className="text-sm text-text-secondary py-6 text-center">Nenhuma hora registrada neste mês.</p>
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-sm text-text-primary truncate">{r.name}</span>
            <span className="text-sm font-medium text-text-primary tabular-nums flex-none">{hm(r.minutes)}</span>
          </div>
          <div className="h-2 bg-surface-alt overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.max(4, (r.minutes / max) * 100)}%`,
                background: r.muted ? 'rgba(15, 15, 15, 0.25)' : 'var(--color-accent)',
                opacity: r.muted ? 0.6 : 1,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// Corpo puro (sem Card/título) — usado dentro do Modal.
// Horas por etapa (task_type), a partir dos cronômetros de tarefa do mês.
function TaskTypesBody({ breakdown, loading }) {
  const rows = useMemo(() => {
    const items = [...(breakdown || [])]
      .map((t) => ({ name: t.task_type || 'Sem etapa', minutes: t.total_minutes || 0 }))
      .filter((t) => t.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)

    const TOP = 5
    if (items.length <= TOP + 1) return items
    const top = items.slice(0, TOP)
    const restMinutes = items.slice(TOP).reduce((s, t) => s + t.minutes, 0)
    if (restMinutes > 0) top.push({ name: 'Outros', minutes: restMinutes, muted: true })
    return top
  }, [breakdown])

  const max = rows.reduce((m, r) => Math.max(m, r.minutes), 0) || 1

  if (loading) return <p className="text-sm text-text-secondary py-6 text-center">Carregando...</p>
  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary py-6 text-center">
        Nenhuma etapa registrada. Defina a etapa nas tarefas e use o cronômetro delas.
      </p>
    )
  }
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-sm text-text-primary truncate">{r.name}</span>
            <span className="text-sm font-medium text-text-primary tabular-nums flex-none">{hm(r.minutes)}</span>
          </div>
          <div className="h-2 bg-surface-alt overflow-hidden">
            <div
              className="h-full bg-state-success transition-all"
              style={{ width: `${Math.max(4, (r.minutes / max) * 100)}%`, opacity: r.muted ? 0.55 : 1 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// Corpo puro (sem Card/título) — usado dentro do Modal.
function HistoryBody({ history, loading }) {
  if (loading) return <p className="text-sm text-text-secondary py-4 text-center">Carregando...</p>
  if ((history || []).length === 0) return <p className="text-sm text-text-secondary py-4 text-center">Sem histórico disponível.</p>
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
      {history.map((h) => (
        <div key={h.ym}>
          <p className="font-display text-lg text-text-primary tabular-nums leading-tight">
            {formatCurrency(h.total_cost)}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {MONTHS_ABBR[h.month - 1]} · {hm(h.total_minutes)}
          </p>
        </div>
      ))}
    </div>
  )
}

// Cartão compacto que abre o corpo completo do painel num Modal.
function CollapsiblePanelCard({ icon: Icon, title, summary, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 border border-border-subtle bg-surface p-4 text-left hover:border-[color:var(--color-accent)]/40 hover:bg-surface-alt transition-colors w-full"
    >
      <span className="w-9 h-9 bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center flex-none">
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

// Admin não bate ponto: a Performance dele é um hub para as ferramentas de
// gestão (os mesmos sub-itens que ficavam no menu).
const ADMIN_TOOLS = [
  { to: '/admin/reports', label: 'Relatórios', desc: 'Horas e custos por período, projeto e pessoa', icon: BarChart3 },
  { to: '/admin/time-entries', label: 'Apontamentos', desc: 'Todos os registros de horas da equipe', icon: FileText },
  { to: '/admin/manage-bonuses', label: 'Bônus', desc: 'Lance e acompanhe bônus dos colaboradores', icon: Gift },
  { to: '/admin/manage-expenses', label: 'Despesas', desc: 'Aprove e gerencie despesas lançadas', icon: Receipt },
]

function AdminPerformanceHub() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Performance"
        subtitle="Ferramentas de gestão da equipe"
      />
      <div className="grid sm:grid-cols-2 gap-3">
        {ADMIN_TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.to}
              to={tool.to}
              className="group flex items-start gap-4 border border-border-subtle bg-surface p-5 hover:border-[color:var(--color-accent)]/40 hover:bg-surface-alt transition-colors"
            >
              <span className="w-11 h-11 bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center flex-none">
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-text-primary">
                  {tool.label}
                  <ChevronRight size={16} className="text-text-secondary group-hover:translate-x-0.5 transition-transform" />
                </span>
                <span className="block text-[13px] text-text-secondary mt-0.5">{tool.desc}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function PerformancePage() {
  const { isAdmin } = useAuth()
  if (isAdmin) return <AdminPerformanceHub />
  return <EmployeePerformancePage />
}

function EmployeePerformancePage() {
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPanel, setOpenPanel] = useState(null) // 'projetos' | 'tarefas' | 'historico' | null

  const monthParam = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    api
      .get(`/me/stats?month=${monthParam}`)
      .then((data) => { if (alive) setStats(data) })
      .catch((err) => { if (alive) setError(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [monthParam])

  useEffect(() => {
    let alive = true
    setHistoryLoading(true)
    api
      .get('/me/monthly-history?months=6')
      .then((data) => { if (alive) setHistory(data.history || []) })
      .catch(() => { if (alive) setHistory([]) })
      .finally(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [])

  function shiftMonth(delta) {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1

  const hourlyRate = stats?.hourly_rate || 0
  const totalMinutes = stats?.total_minutes || 0
  const workingDays = stats?.working_days || 0
  const avgMinutes = stats?.avg_minutes_per_day || 0
  const toReceive = stats?.total_cost || 0

  const monthNav = (
    <div className="flex items-center gap-1 border border-border-subtle bg-surface px-1 py-1">
      <button
        type="button"
        onClick={() => shiftMonth(-1)}
        className="flex h-8 w-8 items-center justify-center text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[130px] text-center text-sm font-medium text-text-primary capitalize">
        {MONTHS_PT[cursor.month - 1]} {cursor.year}
      </span>
      <button
        type="button"
        onClick={() => shiftMonth(1)}
        disabled={isCurrentMonth}
        className="flex h-8 w-8 items-center justify-center text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Performance"
        subtitle="Suas horas, valor e ganhos no período"
        actions={monthNav}
      />

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="Horas trabalhadas"
          value={loading ? '—' : hm(totalMinutes)}
          detail={`${workingDays} ${workingDays === 1 ? 'dia' : 'dias'}`}
        />
        <Kpi
          label="Valor / hora"
          value={loading ? '—' : formatCurrency(hourlyRate)}
          detail="fixo"
        />
        <Kpi
          label="A receber no mês"
          value={loading ? '—' : formatCurrency(toReceive)}
          detail={loading ? '' : `${hm(totalMinutes)} × ${formatCurrency(hourlyRate)}`}
          highlight
        />
        <Kpi
          label="Média / dia"
          value={loading ? '—' : hm(avgMinutes)}
          detail={workingDays > 0 ? `em ${workingDays} ${workingDays === 1 ? 'dia' : 'dias'}` : 'sem registros'}
        />
      </div>

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

      <div className="mt-4">
        <PerformanceSimulator stats={stats} cursor={cursor} />
      </div>
    </div>
  )
}
