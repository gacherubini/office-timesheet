import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { DateRange } from '../components/ui/DateRange'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'

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

const STATUS_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'rejected', label: 'Recusadas' },
]

function StatusChip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-2 border px-3 text-[12px] transition-colors ${
        active
          ? 'border-ink bg-ink text-white'
          : 'border-border-subtle bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
      <span className="text-[10.5px] tabular-nums opacity-65">{count}</span>
    </button>
  )
}

export function ExpensesPage() {
  const fileInputRef = useRef(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createError, setCreateError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
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

  const statusCounts = useMemo(() => {
    const counts = { all: expenses.length, pending: 0, approved: 0, rejected: 0 }
    for (const expense of expenses) {
      if (counts[expense.status] !== undefined) counts[expense.status] += 1
    }
    return counts
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (statusFilter !== 'all' && expense.status !== statusFilter) return false
      if (dateRange.from && expense.expense_date < dateRange.from) return false
      if (dateRange.to && expense.expense_date > dateRange.to) return false
      return true
    })
  }, [expenses, statusFilter, dateRange])

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

  function openCreate() {
    resetForm()
    setCreateError('')
    setShowCreateForm(true)
  }

  function closeCreate() {
    if (submitting) return
    setShowCreateForm(false)
    setCreateError('')
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
    setCreateError('')
    setSuccess('')

    try {
      await createExpenseRequest()
      resetForm()
      setShowCreateForm(false)
      setSuccess('Despesa enviada para aprovação do administrador.')
      await loadExpenses()
    } catch (err) {
      setCreateError(err.message)
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
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        {STATUS_FILTERS.map((f) => (
          <StatusChip
            key={f.key}
            active={statusFilter === f.key}
            label={f.label}
            count={statusCounts[f.key] ?? 0}
            onClick={() => setStatusFilter(f.key)}
          />
        ))}

        <DateRange
          size="sm"
          from={dateRange.from}
          to={dateRange.to}
          onFromChange={(value) => setDateRange((r) => ({ ...r, from: value }))}
          onToChange={(value) => setDateRange((r) => ({ ...r, to: value }))}
          fromLabel=""
          toLabel=""
        />

        <Button className="ml-auto h-8" onClick={openCreate}>
          <Plus size={15} /> Nova despesa
        </Button>
      </div>

      <Card padded={false}>
        <div className="hidden sm:flex items-center gap-3 border-b border-border-subtle bg-bg px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
          <span className="w-24 flex-none">Data</span>
          <span className="flex-1">Despesa</span>
          <span className="w-28 flex-none text-right">Valor</span>
          <span className="w-24 flex-none">Status</span>
          <span className="w-20 flex-none">Comprovante</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Carregando...</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">
              Nenhuma despesa neste período.
            </p>
          ) : (
            filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-[color:var(--color-hover)] sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="text-[12.5px] text-text-primary sm:w-24 sm:flex-none">
                  {formatDate(expense.expense_date)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-text-primary">{expense.title}</p>
                  {expense.description && (
                    <p className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">
                      {expense.description}
                    </p>
                  )}
                  {expense.admin_note && (
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      Admin: {expense.admin_note}
                    </p>
                  )}
                </div>
                <span className="text-[12.5px] font-medium tabular-nums text-text-primary sm:w-28 sm:flex-none sm:text-right">
                  {formatCurrency(expense.amount)}
                </span>
                <span className="sm:w-24 sm:flex-none">
                  <Badge tone={STATUS_TONE[expense.status] || 'neutral'}>
                    {STATUS_LABEL[expense.status] || expense.status}
                  </Badge>
                </span>
                <span className="text-[12.5px] sm:w-20 sm:flex-none">
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
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal
        open={showCreateForm}
        onClose={closeCreate}
        title="Nova despesa"
      >
        {createError && (
          <div className="state-danger-soft text-sm p-3 mb-4">
            {createError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Título"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              required
            />

            <DateField
              label="Data da compra"
              value={form.expense_date}
              onChange={(e) => setForm((prev) => ({ ...prev, expense_date: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] text-text-secondary">Comprovante</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="w-full form-control border px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:text-xs file:font-medium file:bg-surface-alt file:text-text-primary hover:file:bg-surface-alt/70"
            />
            {receiptFile && (
              <p className="mt-1 truncate text-xs text-text-secondary">{receiptFile.name}</p>
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
      </Modal>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess('')}
        size="sm"
        footer={
          <Button onClick={() => setSuccess('')}>OK</Button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="state-success-soft p-4 mb-4">
            <CheckCircle2 className="state-success" size={36} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </div>
  )
}
