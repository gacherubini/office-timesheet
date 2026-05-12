import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
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

      <Card className="mb-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <Select
            className="xl:w-56"
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Rejeitadas</option>
          </Select>

          <Select
            className="xl:w-64"
            label="Colaborador"
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
      </Card>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Data</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Colaborador</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Despesa</th>
              <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Valor</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Status</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Comprovante</th>
              <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                  Nenhuma despesa encontrada.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((expense) => {
                const meta = STATUS_META[expense.status] || { label: expense.status, tone: 'neutral' }
                return (
                  <tr
                    key={expense.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-3 py-3 whitespace-nowrap text-text-primary">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="px-3 py-3 min-w-40">
                      <div className="flex items-center gap-2">
                        <Avatar name={expense.profile?.name} url={expense.profile?.avatar_url} size={28} />
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary truncate">
                            {expense.profile?.name || '-'}
                          </p>
                          {expense.profile?.position && (
                            <p className="text-[11px] text-text-secondary truncate">
                              {expense.profile.position}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-56">
                      <p className="font-medium text-text-primary">{expense.title}</p>
                      {expense.description && (
                        <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                          {expense.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap font-medium text-text-primary tabular-nums">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline hover:opacity-80"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setExpenseToDelete(expense)}
                        className="text-text-secondary hover:text-rose-500 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
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
          <div className="mt-3 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2 text-sm">
            <p className="font-medium text-text-primary">{expenseToDelete.title}</p>
            <p className="text-xs text-text-secondary">
              {expenseToDelete.profile?.name || 'Colaborador'} · {formatDate(expenseToDelete.expense_date)} · {formatCurrency(expenseToDelete.amount)}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
