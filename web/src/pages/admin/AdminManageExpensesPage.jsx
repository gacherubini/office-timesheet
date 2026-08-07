import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/Avatar'

function formatDate(iso) {
  if (!iso) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return date.toLocaleDateString('pt-BR')
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_META = {
  pending: { label: 'Pendente', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  rejected: { label: 'Rejeitada', tone: 'danger' },
}

export function AdminManageExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({ status: 'all', user_id: '' })
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    api.get('/admin/users').then(setUsers).catch(() => {})
  }, [])

  async function loadExpenses() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ status: filters.status || 'all' })
      const data = await api.get(`/admin/expense-requests?${params}`)
      setExpenses(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status])

  const filteredExpenses = useMemo(() => {
    if (!filters.user_id) return expenses
    return expenses.filter((e) => e.user_id === filters.user_id)
  }, [expenses, filters.user_id])

  async function handleConfirmDelete() {
    if (!expenseToDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/admin/expense-requests/${expenseToDelete.id}`)
      setExpenseToDelete(null)
      setSuccessMessage('Despesa excluída com sucesso!')
      await loadExpenses()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Gerenciar Despesas"
        subtitle="Excluir solicitações de despesa registradas no sistema"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          className="w-48"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">Status: todos</option>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
        </Select>

        <Select
          className="w-56"
          value={filters.user_id}
          onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
        >
          <option value="">Toda a equipe</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Carregando...</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Nenhuma despesa encontrada.</p>
          ) : (
            filteredExpenses.map((expense) => {
              const meta = STATUS_META[expense.status] || { label: expense.status, tone: 'neutral' }
              return (
                <div key={expense.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar name={expense.profile?.name} url={expense.profile?.avatar_url} size={28} />
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-[.2em] text-brown">
                          {expense.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-[11px] text-text-secondary">{formatDate(expense.expense_date)}</p>
                      </div>
                    </div>

                    <p className="mt-1.5 text-[12.5px] font-medium text-text-primary">{expense.title}</p>
                    {expense.description && (
                      <p className="text-[12px] text-text-secondary line-clamp-2">{expense.description}</p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-accent underline hover:opacity-80"
                        >
                          Abrir comprovante
                        </a>
                      ) : (
                        <span className="text-[11px] text-text-secondary">Sem comprovante</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-none flex-col items-end gap-2.5">
                    <span className="text-[12.5px] font-medium text-text-primary tabular-nums">
                      {formatCurrency(expense.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpenseToDelete(expense)}
                      className="inline-flex items-center gap-1.5 border border-border-subtle px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-alt"
                      title="Excluir despesa"
                    >
                      <Trash2 size={13} />
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(expenseToDelete)}
        onClose={() => (deleting ? null : setExpenseToDelete(null))}
        title="Excluir despesa"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setExpenseToDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-primary">
          Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita.
        </p>
        {expenseToDelete && (
          <div className="mt-3 border border-border-subtle bg-surface-alt px-3 py-2 text-sm">
            <p className="font-medium text-text-primary">{expenseToDelete.title}</p>
            <p className="text-xs text-text-secondary">
              {expenseToDelete.profile?.name || 'Colaborador'} · {formatDate(expenseToDelete.expense_date)} · {formatCurrency(expenseToDelete.amount)}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(successMessage)}
        onClose={() => setSuccessMessage('')}
        size="sm"
        footer={<Button onClick={() => setSuccessMessage('')}>OK</Button>}
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
