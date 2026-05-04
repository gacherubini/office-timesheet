import { useEffect, useState } from 'react'
import { Check, FileText, Receipt, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
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

export function AdminApprovalsPage() {
  const [requests, setRequests] = useState([])
  const [expenses, setExpenses] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [decidingRequestId, setDecidingRequestId] = useState(null)
  const [decidingExpenseId, setDecidingExpenseId] = useState(null)
  const [error, setError] = useState('')

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

  useEffect(() => {
    loadChangeRequests()
    loadExpenseRequests()
  }, [])

  async function approveRequest(requestId) {
    setDecidingRequestId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/approve`, {})
      await loadChangeRequests()
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
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingExpenseId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Aprovações" subtitle="Solicitações e despesas pendentes" />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-2">
            <FileText size={15} className="text-text-secondary" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Solicitações de apontamento
            </h2>
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
                <div key={request.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={request.profile?.name} url={request.profile?.avatar_url} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {request.profile?.name || 'Colaborador'}
                      </p>
                      <p className="text-xs text-text-secondary">{formatDateTime(request.created_at)}</p>
                    </div>
                  </div>

                  <div className="text-xs text-text-secondary space-y-1">
                    <p>
                      <span className="font-medium text-text-primary">Atual:</span>{' '}
                      {request.time_entry?.projects?.name || '-'} · {formatDateTime(request.time_entry?.started_at)}
                    </p>
                    <p>
                      <span className="font-medium text-text-primary">Pedido:</span>{' '}
                      {request.requested_project?.name || '-'} · {formatDateTime(request.requested_started_at)}
                    </p>
                    <p className="line-clamp-3">{request.reason}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveRequest(request.id)}
                      disabled={decidingRequestId === request.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <Check size={14} />
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectRequest(request.id)}
                      disabled={decidingRequestId === request.id}
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
            <Receipt size={15} className="text-text-secondary" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Despesas
            </h2>
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
                <div key={expense.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={expense.profile?.name} url={expense.profile?.avatar_url} size={36} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {expense.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-xs text-text-secondary">{formatDate(expense.expense_date)}</p>
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
      </div>
    </div>
  )
}
