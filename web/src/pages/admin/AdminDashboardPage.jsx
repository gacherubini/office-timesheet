import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { CheckCircle2, FolderOpen } from 'lucide-react'
import { BirthdayCalendar } from '../../components/BirthdayCalendar'
import { Avatar } from '../../components/Avatar'
import { BrandLine } from '../../components/BrandLine'
import { LiveDot } from '../../components/LiveDot'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { getPeriodRange } from '../../lib/periods'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatHours(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatHM(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRange(startedAt, endedAt) {
  if (!startedAt) return '-'
  return `${formatTime(startedAt)} → ${formatTime(endedAt)}`
}

function isoToDateKey(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Resumo "Ao vivo" na home: quem está com o ponto rodando ou pausado agora.
// O painel completo (com offline e intervalos) fica em /admin/live.
function LiveNowStrip({ live }) {
  const online = (live || []).filter((m) => m.status === 'running' || m.status === 'paused')
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border border-border-subtle bg-surface px-5 py-2.5">
      <span className="flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-text-secondary">
        <span className="h-1.5 w-1.5 rounded-full bg-orange" />
        Ao vivo · {online.length}
      </span>
      {online.length === 0 ? (
        <span className="text-[12px] text-text-secondary">Ninguém batendo ponto agora.</span>
      ) : (
        online.map((user) => (
          <span key={user.id} className="flex items-center gap-2 text-[12px]">
            <Avatar name={user.name} url={user.avatar_url} size={22} />
            {user.name.split(' ')[0]}
            <span className="text-text-secondary">
              · {user.status === 'paused' ? 'pausado' : user.task || user.project || 'em andamento'}
            </span>
          </span>
        ))
      )}
      <Link
        to="/admin/live"
        className="ml-auto border-b border-ink text-[9px] uppercase tracking-[.18em] text-text-primary"
      >
        Painel completo
      </Link>
    </div>
  )
}

export function AdminDashboardPage() {
  const [period, setPeriod] = useState('month')
  const { start_date: startDate, end_date: endDate } = getPeriodRange(period)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('team')
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [vacations, setVacations] = useState([])
  const [vacationsLoading, setVacationsLoading] = useState(true)
  const [decidingId, setDecidingId] = useState(null)
  const [decidingExpenseId, setDecidingExpenseId] = useState(null)
  const [decidingVacationId, setDecidingVacationId] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [live, setLive] = useState([])

  useEffect(() => {
    function loadLive() {
      api.get('/admin/live').then(setLive).catch(() => {})
    }
    loadLive()
    const poll = setInterval(loadLive, 20000)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true)
    setError('')
    api
      .get(`/admin/dashboard?start_date=${startDate}&end_date=${endDate}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  async function loadChangeRequests() {
    setRequestsLoading(true)
    try {
      const data = await api.get('/admin/time-entry-change-requests?status=pending')
      setRequests(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setRequestsLoading(false)
    }
  }

  async function loadExpenseRequests() {
    setExpensesLoading(true)
    try {
      const data = await api.get('/admin/expense-requests?status=pending')
      setExpenses(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setExpensesLoading(false)
    }
  }

  async function loadVacationRequests() {
    setVacationsLoading(true)
    try {
      const data = await api.get('/admin/vacation-requests?status=pending')
      setVacations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setVacationsLoading(false)
    }
  }

  useEffect(() => {
    loadChangeRequests()
    loadExpenseRequests()
    loadVacationRequests()
  }, [])

  async function refreshDashboard() {
    if (!startDate || !endDate) return
    const nextData = await api.get(`/admin/dashboard?start_date=${startDate}&end_date=${endDate}`)
    setData(nextData)
  }

  async function approveRequest(requestId) {
    setDecidingId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/approve`, {})
      await Promise.all([loadChangeRequests(), refreshDashboard()])
      setSuccessMessage('Solicitação aprovada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingId(null)
    }
  }

  async function rejectRequest(requestId) {
    const adminNote = window.prompt('Motivo da rejeição (opcional):')
    if (adminNote === null) return

    setDecidingId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/reject`, { admin_note: adminNote })
      await loadChangeRequests()
      setSuccessMessage('Solicitação rejeitada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingId(null)
    }
  }

  async function approveExpense(expenseId) {
    setDecidingExpenseId(expenseId)
    setError('')
    try {
      await api.post(`/admin/expense-requests/${expenseId}/approve`, {})
      await Promise.all([loadExpenseRequests(), refreshDashboard()])
      setSuccessMessage('Despesa aprovada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingExpenseId(null)
    }
  }

  async function rejectExpense(expenseId) {
    const adminNote = window.prompt('Motivo da rejeição (opcional):')
    if (adminNote === null) return

    setDecidingExpenseId(expenseId)
    setError('')
    try {
      await api.post(`/admin/expense-requests/${expenseId}/reject`, { admin_note: adminNote })
      await loadExpenseRequests()
      setSuccessMessage('Despesa rejeitada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingExpenseId(null)
    }
  }

  async function approveVacation(vacationId) {
    setDecidingVacationId(vacationId)
    setError('')
    try {
      await api.post(`/admin/vacation-requests/${vacationId}/approve`, {})
      await loadVacationRequests()
      setSuccessMessage('Solicitação de férias aprovada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingVacationId(null)
    }
  }

  async function rejectVacation(vacationId) {
    const adminNote = window.prompt('Motivo da rejeição (opcional):')
    if (adminNote === null) return

    setDecidingVacationId(vacationId)
    setError('')
    try {
      await api.post(`/admin/vacation-requests/${vacationId}/reject`, { admin_note: adminNote })
      await loadVacationRequests()
      setSuccessMessage('Solicitação de férias rejeitada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingVacationId(null)
    }
  }

  // Solicitações, despesas e férias são a mesma tarefa do gestor: decidir.
  // Viram uma fila só, com etiqueta de tipo.
  const pending = [
    ...requests.map((r) => ({
      key: `req-${r.id}`,
      type: 'Horas',
      who: r.profile?.name || 'Colaborador',
      detail: `${r.time_entry?.project?.name || '-'}, ${isoToDateKey(r.time_entry?.started_at)} — ${formatRange(r.time_entry?.started_at, r.time_entry?.ended_at)} passa a ${formatRange(r.requested_started_at, r.requested_ended_at)}`,
      busy: decidingId === r.id,
      onApprove: () => approveRequest(r.id),
      onReject: () => rejectRequest(r.id),
    })),
    ...expenses.map((e) => ({
      key: `exp-${e.id}`,
      type: 'Despesa',
      who: e.profile?.name || 'Colaborador',
      detail: `${e.title} — ${formatCurrency(e.amount)}`,
      busy: decidingExpenseId === e.id,
      onApprove: () => approveExpense(e.id),
      onReject: () => rejectExpense(e.id),
    })),
    ...vacations.map((v) => ({
      key: `vac-${v.id}`,
      type: 'Férias',
      who: v.profile?.name || 'Colaborador',
      detail: `${formatDate(v.start_date)} → ${formatDate(v.end_date)}, ${formatDays(v.days_count)}`,
      busy: decidingVacationId === v.id,
      onApprove: () => approveVacation(v.id),
      onReject: () => rejectVacation(v.id),
    })),
  ]

  const pendingLoading = requestsLoading || expensesLoading || vacationsLoading

  const kpis = data?.kpis
  const liveStatusById = {}
  for (const l of live) {
    if (l.status === 'running' || l.status === 'paused') liveStatusById[l.id] = l.status
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-light leading-tight">
          Visão geral da <span className="font-serif-em">operação</span>
        </h1>
        <div className="flex gap-4">
          {[
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
            { value: 'quarter', label: 'Trimestre' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`pb-0.5 text-[10px] uppercase tracking-[.18em] transition-colors ${
                period === option.value
                  ? 'border-b border-ink text-text-primary'
                  : 'border-b border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mb-6">
          {error}
        </div>
      )}

      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-8 overflow-hidden bg-brown px-6 py-6 text-white">
        <BrandLine x1={6} y1={112} x2={94} y2={-12} opacity={0.34} />
        <div className="relative z-10">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Horas da equipe</p>
          <p className="mt-2 font-display text-5xl font-light leading-none tabular-nums">
            {loading ? '—' : formatHM(kpis?.total_minutes ?? 0)}
          </p>
        </div>
        <div className="relative z-10 flex gap-9 pb-1">
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Usuários ativos</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : `${kpis?.active_users ?? 0} de ${kpis?.total_users ?? 0}`}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Projetos ativos</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : `${kpis?.active_projects ?? 0} de ${kpis?.total_projects ?? 0}`}
            </p>
          </div>
        </div>
      </div>

      <LiveNowStrip live={live} />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0 space-y-5">
        <Card padded={false} className="overflow-hidden">
          <div className="px-2 pt-2">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'team', label: 'Equipe' },
                { value: 'projects', label: 'Projetos' },
              ]}
            />
          </div>

          <div className="divide-y divide-border-subtle">
            {loading ? (
              <div className="py-10 text-center text-text-secondary text-sm">Carregando...</div>
            ) : tab === 'team' ? (
              (data?.team ?? []).length === 0 ? (
                <div className="py-10 text-center text-text-secondary text-sm">
                  Nenhum apontamento no período.
                </div>
              ) : (
                data.team.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between px-5 py-4 hover:bg-surface-alt transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={member.name} url={member.avatar_url} size={36} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
                          <span className="truncate">{member.name}</span>
                          {liveStatusById[member.user_id] && (
                            <LiveDot paused={liveStatusById[member.user_id] === 'paused'} />
                          )}
                        </p>
                        {member.position && (
                          <p className="text-xs text-text-secondary truncate">{member.position}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary tabular-nums">
                        {formatHours(member.total_minutes)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {member.project_count} {member.project_count === 1 ? 'Projeto' : 'Projetos'}
                      </p>
                    </div>
                  </div>
                ))
              )
            ) : (data?.projects ?? []).length === 0 ? (
              <div className="py-10 text-center text-text-secondary text-sm">
                Nenhum apontamento no período.
              </div>
            ) : (
              data.projects.map((project) => (
                <div
                  key={project.project_id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-surface-alt transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-surface-alt flex items-center justify-center flex-shrink-0">
                      <FolderOpen size={18} className="text-accent" />
                    </div>
                    <p className="text-sm font-medium text-text-primary truncate">{project.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-text-primary tabular-nums">
                      {formatHours(project.total_minutes)}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {project.member_count} {project.member_count === 1 ? 'Membro' : 'Membros'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        </div>

        <div className="lg:w-80 space-y-5">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <h2 className="text-[9px] uppercase tracking-[.2em] text-text-secondary">
                Precisa de você
              </h2>
              {pending.length > 0 && (
                <span className="text-[11px] font-medium tabular-nums text-orange">{pending.length}</span>
              )}
            </div>
            <div className="divide-y divide-border-subtle">
              {pendingLoading ? (
                <p className="px-5 py-8 text-center text-sm text-text-secondary">Carregando...</p>
              ) : pending.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-text-secondary">
                  Nada esperando por você.
                </p>
              ) : (
                pending.map((item) => (
                  <div key={item.key} className="px-5 py-3.5">
                    <p className="text-[9px] uppercase tracking-[.2em] text-brown">
                      {item.type} · {item.who}
                    </p>
                    <p className="mt-1.5 text-[12px] text-text-secondary">{item.detail}</p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={item.onApprove}
                        disabled={item.busy}
                        className="bg-green-dk px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={item.onReject}
                        disabled={item.busy}
                        className="border border-border-subtle px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <BirthdayCalendar />
        </div>
      </div>

      <Modal
        open={Boolean(successMessage)}
        onClose={() => setSuccessMessage('')}
        size="sm"
        footer={
          <Button onClick={() => setSuccessMessage('')}>OK</Button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>
    </div>
  )
}
