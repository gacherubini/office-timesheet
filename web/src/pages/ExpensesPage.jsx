import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { CheckCircle2 } from 'lucide-react'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function todayValue() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const STATUS_LABEL = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
}

export function ExpensesPage() {
  const fileInputRef = useRef(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    expense_date: todayValue(),
  })
  const [receiptFile, setReceiptFile] = useState(null)

  async function loadExpenses() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/me/expense-requests')
      setExpenses(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  function resetForm() {
    setForm({
      title: '',
      description: '',
      amount: '',
      expense_date: todayValue(),
    })
    setReceiptFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function createExpenseRequest() {
    const token = localStorage.getItem('access_token')
    const formData = new FormData()

    formData.append('title', form.title)
    formData.append('description', form.description)
    formData.append('amount', String(Number(form.amount)))
    formData.append('expense_date', form.expense_date)
    if (receiptFile) formData.append('receipt', receiptFile)

    const res = await fetch(`${BASE_URL}/me/expense-requests`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })

    const text = await res.text()
    const data = text ? JSON.parse(text) : null

    if (res.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      localStorage.removeItem('profile')
      window.location.href = '/login'
      throw new Error('Sessão expirada.')
    }

    if (!res.ok) {
      throw new Error(data?.error || 'Erro ao enviar despesa.')
    }

    return data
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      await createExpenseRequest()
      resetForm()
      setSuccess('Despesa enviada para aprovação do administrador.')
      await loadExpenses()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Despesas"
        subtitle="Envie comprovantes para reembolso"
      />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
        <Card>
          <h2 className="font-display text-lg text-text-primary mb-4">Nova despesa</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Título"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <Input
                label="Valor"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                required
              />

              <Input
                label="Data da compra"
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((prev) => ({ ...prev, expense_date: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Comprovante
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="w-full form-control border rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-surface-alt file:text-text-primary hover:file:bg-surface-alt/70"
              />
              {receiptFile && (
                <p className="text-xs text-text-secondary mt-1 truncate">{receiptFile.name}</p>
              )}
            </div>

            <Input
              label="Descrição"
              as="textarea"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              className="!min-h-24"
            />

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Enviando...' : 'Enviar despesa'}
            </Button>
          </form>
        </Card>

        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-alt">
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Data
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Despesa
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Valor
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Comprovante
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-text-secondary">
                    Carregando...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-text-secondary">
                    Nenhuma despesa enviada.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-text-primary">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3 min-w-52">
                      <p className="font-medium text-text-primary">{expense.title}</p>
                      {expense.description && (
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {expense.description}
                        </p>
                      )}
                      {expense.admin_note && (
                        <p className="text-xs text-text-secondary mt-1">
                          Admin: {expense.admin_note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium tabular-nums text-text-primary">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={STATUS_TONE[expense.status] || 'neutral'}>
                        {STATUS_LABEL[expense.status] || expense.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess('')}
        size="sm"
        footer={
          <Button onClick={() => setSuccess('')}>OK</Button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </div>
  )
}
