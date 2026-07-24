import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { CalendarOff, Check, CheckCircle2, Clock, FolderOpen, Receipt, Users, X, Radio, ChevronRight, ListTodo } from 'lucide-react'
import { BirthdayCalendar } from '../../components/BirthdayCalendar'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/ui/PageHeader'
import { LiveDot } from '../../components/LiveDot'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

const FULL_RANGE_START = '2000-01-01'
const FULL_RANGE_END = '2099-12-31'

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

function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

const LIVE_STATUS_META = {
  running: { label: 'Em andamento', color: '#16A34A' },
  paused: { label: 'Pausado', color: '#E8B004' },
}

// Resumo "Ao vivo" na home: quem está com o ponto rodando/pausado agora.
// O painel completo (com offline e intervalos) fica em /admin/live.
function LiveNowCard({ live }) {
  const online = (live || []).filter((m) => m.status === 'running' || m.status === 'paused')
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-emerald-500" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Ao vivo
          </h2>
          <span className="text-[11px] font-semibold text-emerald-500 tabular-nums">
            {online.length} online
          </span>
        </div>
        <Link
          to="/admin/live"
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:opacity-80 transition-opacity"
        >
          Painel completo <ChevronRight size={13} />
        </Link>
      </div>

      <div className="divide-y divide-border-subtle">
        {online.length === 0 ? (
          <div className="py-8 px-5 text-center text-sm text-text-secondary">
            Ninguém batendo ponto agora.
          </div>
        ) : (
          online.map((u) => {
            const meta = LIVE_STATUS_META[u.status]
            return (
              <div key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <Avatar name={u.name} url={u.avatar_url} size={34} />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface"
                      style={{ background: meta.color }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                    {u.task ? (
                      <p className="flex items-center gap-1 text-[11px] text-accent truncate">
                        <ListTodo size={11} className="flex-shrink-0" />
                        <span className="truncate">{u.task}</span>
                      </p>
                    ) : u.project ? (
                      <p className="text-[11px] text-text-secondary truncate">{u.project}</p>
                    ) : (
                      <p className="text-[11px] text-text-secondary">
                        {u.started_at ? `Entrou às ${formatTime(u.started_at)}` : 'Em andamento'}
                      </p>
                    )}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary flex-none">
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

export function AdminDashboardPage() {
  const startDate = FULL_RANGE_START
  const endDate = FULL_RANGE_END
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

  const kpis = data?.kpis
  const liveStatusById = {}
  for (const l of live) {
    if (l.status === 'running' || l.status === 'paused') liveStatusById[l.id] = l.status
  }

  return (
    <div>
      <PageHeader title="Início" subtitle="Visão geral da operação" />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-6">
          {error}
        </div>
      )}

      <Card padded={false} className="rounded-2xl overflow-hidden mb-7">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border-subtle">
          <div className="bg-surface px-5 py-4">
            <div className="flex items-center gap-1.5 text-text-secondary">
              <Clock size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Horas da equipe</span>
            </div>
            <p className="font-display text-[30px] tabular-nums text-text-primary mt-1.5 leading-none">
              {loading ? '—' : formatHM(kpis?.total_minutes ?? 0)}
            </p>
          </div>
          <div className="bg-surface px-5 py-4">
            <div className="flex items-center gap-1.5 text-text-secondary">
              <Users size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Usuários ativos</span>
            </div>
            <p className="font-display text-2xl tabular-nums text-text-primary mt-1.5 leading-none">
              {loading ? '—' : `${kpis?.active_users ?? 0} de ${kpis?.total_users ?? 0}`}
            </p>
          </div>
          <div className="bg-surface px-5 py-4">
            <div className="flex items-center gap-1.5 text-text-secondary">
              <FolderOpen size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Projetos ativos</span>
            </div>
            <p className="font-display text-2xl tabular-nums text-text-primary mt-1.5 leading-none">
              {loading ? '—' : `${kpis?.active_projects ?? 0} de ${kpis?.total_projects ?? 0}`}
            </p>
          </div>
        </div>
      </Card>

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

        <LiveNowCard live={live} />
        </div>

        <div className="lg:w-80 space-y-5">
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Solicitações
              </h2>
            </div>

            <div className="divide-y divide-border-subtle">
              {requestsLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : requests.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Nenhuma solicitação pendente.
                </div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={request.profile?.name}
                        url={request.profile?.avatar_url}
                        size={34}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {request.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {formatDateTime(request.created_at)}
                        </p>
                      </div>
                    </div>

                    {(() => {
                      const currentProject = request.time_entry?.project?.name || '-'
                      const requestedProject = request.requested_project?.name || '-'
                      const currentDate = isoToDateKey(request.time_entry?.started_at)
                      const requestedDate = isoToDateKey(request.requested_started_at)
                      const sameProject = currentProject === requestedProject
                      const sameDate = currentDate === requestedDate

                      return (
                        <div className="text-xs text-text-secondary space-y-1">
                          {sameProject && sameDate ? (
                            <>
                              <p className="text-text-primary font-medium">
                                {currentProject} · {currentDate}
                              </p>
                              <p>
                                <span className="font-medium text-text-primary">Atual:</span>{' '}
                                {formatRange(request.time_entry?.started_at, request.time_entry?.ended_at)}
                              </p>
                              <p>
                                <span className="font-medium text-text-primary">Pedido:</span>{' '}
                                {formatRange(request.requested_started_at, request.requested_ended_at)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p>
                                <span className="font-medium text-text-primary">Atual:</span>{' '}
                                {currentProject} · {currentDate},{' '}
                                {formatRange(request.time_entry?.started_at, request.time_entry?.ended_at)}
                              </p>
                              <p>
                                <span className="font-medium text-text-primary">Pedido:</span>{' '}
                                {requestedProject} · {requestedDate},{' '}
                                {formatRange(request.requested_started_at, request.requested_ended_at)}
                              </p>
                            </>
                          )}
                          <p className="line-clamp-3">{request.reason}</p>
                        </div>
                      )
                    })()}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveRequest(request.id)}
                        disabled={decidingId === request.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <Check size={14} />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectRequest(request.id)}
                        disabled={decidingId === request.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60 transition-colors"
                      >
                        <X size={14} />
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-2">
              <Receipt size={14} className="text-text-secondary" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Despesas
              </h2>
            </div>

            <div className="divide-y divide-border-subtle">
              {expensesLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : expenses.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Nenhuma despesa pendente.
                </div>
              ) : (
                expenses.map((expense) => (
                  <div key={expense.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={expense.profile?.name}
                          url={expense.profile?.avatar_url}
                          size={34}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {expense.profile?.name || 'Colaborador'}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {formatDate(expense.expense_date)}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-text-primary whitespace-nowrap tabular-nums">
                        {formatCurrency(expense.amount)}
                      </p>
                    </div>

                    <div className="text-xs text-text-secondary space-y-1">
                      <p className="font-medium text-text-primary">{expense.title}</p>
                      {expense.description && <p className="line-clamp-3">{expense.description}</p>}
                      {expense.receipt_url && (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-accent underline hover:opacity-80"
                        >
                          Abrir comprovante
                        </a>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveExpense(expense.id)}
                        disabled={decidingExpenseId === expense.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <Check size={14} />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectExpense(expense.id)}
                        disabled={decidingExpenseId === expense.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60 transition-colors"
                      >
                        <X size={14} />
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-2">
              <CalendarOff size={14} className="text-text-secondary" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Férias
              </h2>
            </div>

            <div className="divide-y divide-border-subtle">
              {vacationsLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : vacations.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Nenhuma solicitação de férias pendente.
                </div>
              ) : (
                vacations.map((vacation) => (
                  <div key={vacation.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={vacation.profile?.name}
                        url={vacation.profile?.avatar_url}
                        size={34}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {vacation.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {formatDateTime(vacation.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-text-secondary space-y-1">
                      <p className="font-medium text-text-primary">
                        {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                      </p>
                      <p>{formatDays(vacation.days_count)}</p>
                      {vacation.reason && <p className="line-clamp-3">{vacation.reason}</p>}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveVacation(vacation.id)}
                        disabled={decidingVacationId === vacation.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <Check size={14} />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectVacation(vacation.id)}
                        disabled={decidingVacationId === vacation.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60 transition-colors"
                      >
                        <X size={14} />
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
