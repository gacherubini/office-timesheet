import { useEffect, useState } from 'react'
import { CalendarOff, CheckCircle2, FileText, Receipt } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateBR as formatDate } from '../../lib/dates'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
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

export function AdminApprovalsPage() {
  const [requests, setRequests] = useState([])
  const [expenses, setExpenses] = useState([])
  const [vacations, setVacations] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [vacationsLoading, setVacationsLoading] = useState(true)
  const [decidingRequestId, setDecidingRequestId] = useState(null)
  const [decidingExpenseId, setDecidingExpenseId] = useState(null)
  const [decidingVacationId, setDecidingVacationId] = useState(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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

  async function approveRequest(requestId) {
    setDecidingRequestId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/approve`, {})
      await loadChangeRequests()
      setSuccessMessage('Solicitação aprovada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingRequestId(null)
    }
  }

  async function rejectRequest(requestId) {
    const adminNote = window.prompt('Motivo da rejeição (opcional):')
    if (adminNote === null) return

    setDecidingRequestId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/reject`, { admin_note: adminNote })
      await loadChangeRequests()
      setSuccessMessage('Solicitação rejeitada com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingRequestId(null)
    }
  }

  async function approveExpense(expenseId) {
    setDecidingExpenseId(expenseId)
    setError('')
    try {
      await api.post(`/admin/expense-requests/${expenseId}/approve`, {})
      await loadExpenseRequests()
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

  return (
    <div>
      <PageHeader title="Aprovações" subtitle="Solicitações, despesas e férias pendentes" />

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-text-secondary">
              <FileText size={13} />
              Solicitações de apontamento
            </h2>
            {requests.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-orange">{requests.length}</span>
            )}
          </div>

          <div className="divide-y divide-border-subtle">
            {requestsLoading ? (
              <div className="py-10 text-center text-sm text-text-secondary">Carregando...</div>
            ) : requests.length === 0 ? (
              <div className="py-10 px-5 text-center text-sm text-text-secondary">
                Nenhuma solicitação pendente.
              </div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={request.profile?.name} url={request.profile?.avatar_url} size={32} />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[.2em] text-brown truncate">
                        {request.profile?.name || 'Colaborador'}
                      </p>
                      <p className="mt-1 text-[11px] text-text-secondary">{formatDateTime(request.created_at)}</p>
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
                      <div className="mt-1.5 text-[12px] text-text-secondary space-y-1">
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

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveRequest(request.id)}
                      disabled={decidingRequestId === request.id}
                      className="bg-green-dk px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectRequest(request.id)}
                      disabled={decidingRequestId === request.id}
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

        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-text-secondary">
              <Receipt size={13} />
              Despesas
            </h2>
            {expenses.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-orange">{expenses.length}</span>
            )}
          </div>

          <div className="divide-y divide-border-subtle">
            {expensesLoading ? (
              <div className="py-10 text-center text-sm text-text-secondary">Carregando...</div>
            ) : expenses.length === 0 ? (
              <div className="py-10 px-5 text-center text-sm text-text-secondary">
                Nenhuma despesa pendente.
              </div>
            ) : (
              expenses.map((expense) => (
                <div key={expense.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={expense.profile?.name} url={expense.profile?.avatar_url} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] uppercase tracking-[.2em] text-brown truncate">
                          {expense.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-[12px] font-medium text-text-primary whitespace-nowrap tabular-nums">
                          {formatCurrency(expense.amount)}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-text-secondary">{formatDate(expense.expense_date)}</p>
                    </div>
                  </div>

                  <div className="mt-1.5 text-[12px] text-text-secondary space-y-1">
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

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveExpense(expense.id)}
                      disabled={decidingExpenseId === expense.id}
                      className="bg-green-dk px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectExpense(expense.id)}
                      disabled={decidingExpenseId === expense.id}
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

        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-text-secondary">
              <CalendarOff size={13} />
              Férias
            </h2>
            {vacations.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-orange">{vacations.length}</span>
            )}
          </div>

          <div className="divide-y divide-border-subtle">
            {vacationsLoading ? (
              <div className="py-10 text-center text-sm text-text-secondary">Carregando...</div>
            ) : vacations.length === 0 ? (
              <div className="py-10 px-5 text-center text-sm text-text-secondary">
                Nenhuma solicitação de férias pendente.
              </div>
            ) : (
              vacations.map((vacation) => (
                <div key={vacation.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={vacation.profile?.name} url={vacation.profile?.avatar_url} size={32} />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[.2em] text-brown truncate">
                        {vacation.profile?.name || 'Colaborador'}
                      </p>
                      <p className="mt-1 text-[11px] text-text-secondary">{formatDateTime(vacation.created_at)}</p>
                    </div>
                  </div>

                  <div className="mt-1.5 text-[12px] text-text-secondary space-y-1">
                    <p className="font-medium text-text-primary">
                      {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                    </p>
                    <p>{formatDays(vacation.days_count)}</p>
                    {vacation.reason && <p className="line-clamp-3">{vacation.reason}</p>}
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveVacation(vacation.id)}
                      disabled={decidingVacationId === vacation.id}
                      className="bg-green-dk px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectVacation(vacation.id)}
                      disabled={decidingVacationId === vacation.id}
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
          <div className="state-success-soft p-4 mb-4">
            <CheckCircle2 className="state-success" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>
    </div>
  )
}
