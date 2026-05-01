import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

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

function statusLabel(status) {
  const map = {
    pending: { text: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
    approved: { text: 'Aprovada', cls: 'bg-green-100 text-green-700' },
    rejected: { text: 'Recusada', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] || { text: status, cls: 'bg-gray-100 text-gray-700' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Despesas</h1>
        {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">{success}</p>}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Nova despesa</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data da compra</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((prev) => ({ ...prev, expense_date: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {receiptFile && (
              <p className="text-xs text-gray-500 mt-1 truncate">{receiptFile.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-24 resize-y focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
          >
            {submitting ? 'Enviando...' : 'Enviar despesa'}
          </button>
        </form>

        <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Despesa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Valor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">Carregando...</td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    Nenhuma despesa enviada.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(expense.expense_date)}</td>
                    <td className="px-4 py-3 min-w-52">
                      <p className="font-medium text-gray-900">{expense.title}</p>
                      {expense.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{expense.description}</p>
                      )}
                      {expense.admin_note && (
                        <p className="text-xs text-gray-500 mt-1">Admin: {expense.admin_note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{formatCurrency(expense.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{statusLabel(expense.status)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-700 underline hover:text-gray-900"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
