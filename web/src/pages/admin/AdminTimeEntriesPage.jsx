import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Plus, X, Trash2, Pencil } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../../components/Avatar'

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  }
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return date.toLocaleDateString('pt-BR')
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(minutes) {
  const totalMinutes = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function statusLabel(status) {
  if (status === 'completed') return 'Salvo'
  if (status === 'running') return 'Em andamento'
  if (status === 'paused') return 'Pausado'
  return status || '-'
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}

export function AdminTimeEntriesPage() {
  const { profile } = useAuth()
  const monthRange = getMonthRange()
  const [entries, setEntries] = useState([])
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState({
    user_id: '',
    project_id: '',
    start_date: monthRange.start_date,
    end_date: monthRange.end_date,
  })

  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [selectedPauses, setSelectedPauses] = useState(null)
  const [form, setForm] = useState({ user_id: '', project_id: '', started_at: '', ended_at: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/admin/users'),
      api.get('/projects'),
    ]).then(([u, p]) => {
      setUsers(u)
      setProjects(p)
    })
  }, [])

  async function loadEntries(page = 1) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 50 })
      if (filters.user_id) params.set('user_id', filters.user_id)
      if (filters.project_id) params.set('project_id', filters.project_id)
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)

      const res = await api.get(`/admin/time-entries?${params}`)
      setEntries(res.data)
      setExpenses(res.expenses || [])
      setSummary(res.summary)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEntries() }, [])

  function handleFilter(e) {
    e.preventDefault()
    loadEntries(1)
  }

  function resetForm() {
    setForm({ user_id: '', project_id: '', started_at: '', ended_at: '' })
    setEditingEntry(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(entry) {
    setForm({
      user_id: entry.user_id,
      project_id: entry.project_id,
      started_at: entry.started_at?.slice(0, 16) || '',
      ended_at: entry.ended_at?.slice(0, 16) || '',
    })
    setEditingEntry(entry)
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      if (editingEntry) {
        await api.put(`/admin/time-entries/${editingEntry.id}`, {
          started_at: form.started_at,
          ended_at: form.ended_at,
          project_id: form.project_id,
        })
      } else {
        await api.post('/admin/time-entries', form)
      }
      resetForm()
      loadEntries(pagination.page)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este registro?')) return
    try {
      await api.delete(`/admin/time-entries/${id}`)
      loadEntries(pagination.page)
    } catch (err) {
      alert(err.message)
    }
  }

  const selectedUser = users.find((user) => user.id === filters.user_id)
  const dailyTotals = (summary?.daily_totals || []).reduce((acc, item) => {
    acc[`${item.user_id}:${item.date}`] = item.minutes
    return acc
  }, {})

  const seenDailyKeys = new Set()
  const tableEntries = entries.map((entry) => {
    const date = entry.started_at?.slice(0, 10)
    const dailyKey = `${entry.user_id}:${date}`
    const showDailyTotal = !seenDailyKeys.has(dailyKey)
    seenDailyKeys.add(dailyKey)
    return {
      ...entry,
      dailyKey,
      dailyTotalMinutes: showDailyTotal ? dailyTotals[dailyKey] : null,
    }
  })

  const totalCost = summary?.total_cost || 0
  const reimbursements = summary?.reimbursements || 0
  const bonuses = summary?.bonuses || 0
  const netTotal = summary?.net_total ?? (totalCost + reimbursements + bonuses)

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.name} url={profile?.avatar_url} size={44} />
          <div>
            <h1 className="text-2xl font-bold">Histórico da Equipe</h1>
            <p className="text-sm text-gray-500">
              {profile?.name || 'Administrador'} · Administrador
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true) }}
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Adicionar Registro
        </button>
      </div>

      <form onSubmit={handleFilter} className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <div className="min-w-0 xl:w-64">
            <label className="block text-xs text-gray-500 mb-1">Histórico</label>
            <select
              value={filters.user_id}
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Toda a equipe</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div className="min-w-0 xl:w-56">
            <label className="block text-xs text-gray-500 mb-1">Projeto</label>
            <select
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos os projetos</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">De</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="hidden xl:block pb-2 text-gray-400">→</div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Até</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
          >
            Histórico
          </button>

          <button
            type="button"
            className="border border-gray-300 px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Solicitações
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={selectedUser?.name || 'Equipe'} url={selectedUser?.avatar_url} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{selectedUser?.name || 'Toda a equipe'}</p>
            <p className="text-xs text-gray-500 truncate">{selectedUser?.position || 'Histórico consolidado'}</p>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3 mb-4">
        <SummaryCard label="Salário Base / Horas" value={formatCurrency(totalCost)} />
        <SummaryCard label="Reembolso Despesas" value={formatCurrency(reimbursements)} />
        <SummaryCard label="Adicional Bônus" value={formatCurrency(bonuses)} />
        <SummaryCard label="Total Líquido" value={formatCurrency(netTotal)} />
        <SummaryCard label="Horas Totais" value={formatDuration(summary?.total_minutes)} />
        <SummaryCard label="Média de Horas/Dia" value={formatDuration(summary?.average_minutes_per_day)} />
        <SummaryCard label="Dias Trabalhados" value={String(summary?.working_days || 0)} />
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

      {expenses.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-x-auto mb-4">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Despesas</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 whitespace-nowrap">
                <th className="text-left px-3 py-3 font-medium text-gray-600">Data</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Colaborador</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Despesa</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Valor</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(expense.expense_date)}</td>
                  <td className="px-3 py-3 min-w-40">
                    <p className="font-medium text-gray-900">{expense.profile?.name || '-'}</p>
                    {expense.profile?.position && <p className="text-[11px] text-gray-400">{expense.profile.position}</p>}
                  </td>
                  <td className="px-3 py-3 min-w-56">
                    <p className="font-medium text-gray-900">{expense.title}</p>
                    {expense.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{expense.description}</p>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium">{formatCurrency(expense.amount)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {expense.status === 'approved' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Aprovada</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">Pendente</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingEntry ? 'Editar Registro' : 'Adicionar Registro'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-3">
              {!editingEntry && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                  <select
                    required
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Selecione...</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projeto</label>
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Selecione...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
                <input
                  type="datetime-local"
                  required
                  value={form.started_at}
                  onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Saída</label>
                <input
                  type="datetime-local"
                  required
                  value={form.ended_at}
                  onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800">
                {editingEntry ? 'Salvar' : 'Adicionar Registro'}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedPauses && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Pausas</h2>
              <button onClick={() => setSelectedPauses(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="divide-y border rounded-lg overflow-hidden">
              {selectedPauses.map((pause, index) => (
                <div key={pause.id || index} className="grid grid-cols-3 gap-3 px-4 py-3 text-sm">
                  <span className="text-gray-500">Pausa {index + 1}</span>
                  <span>{formatTime(pause.paused_at)}</span>
                  <span>{pause.resumed_at ? formatTime(pause.resumed_at) : 'Aberta'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50 whitespace-nowrap">
              <th className="text-left px-3 py-3 font-medium text-gray-600">Data</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Colaborador</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Projeto</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Início</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Pausas</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Saída</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Total</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Total/Dia</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Saldo</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Bônus</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Off Auto</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Editado</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : tableEntries.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400">Nenhum registro encontrado.</td></tr>
            ) : tableEntries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50 align-top">
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(entry.started_at)}</td>
                <td className="px-3 py-3 min-w-40">
                  <p className="font-medium text-gray-900">{entry.profiles?.name || '-'}</p>
                  {entry.profiles?.position && <p className="text-[11px] text-gray-400">{entry.profiles.position}</p>}
                </td>
                <td className="px-3 py-3 min-w-48">{entry.projects?.name || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatTime(entry.started_at)}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {entry.pauses?.length ? (
                    <button
                      type="button"
                      onClick={() => setSelectedPauses(entry.pauses)}
                      className="text-gray-700 underline hover:text-gray-900"
                    >
                      Visualizar ({entry.pauses.length})
                    </button>
                  ) : '—'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatTime(entry.ended_at)}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">{formatDuration(entry.duration_minutes)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{entry.dailyTotalMinutes === null ? '' : formatDuration(entry.dailyTotalMinutes)}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">{formatCurrency(entry.cost_snapshot)}</td>
                <td className="px-3 py-3 whitespace-nowrap">Não</td>
                <td className="px-3 py-3 whitespace-nowrap">Não</td>
                <td className="px-3 py-3 whitespace-nowrap">{entry.edited_at ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-3 whitespace-nowrap">{statusLabel(entry.status)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(entry)} className="text-gray-400 hover:text-gray-700 mr-2" title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-600" title="Excluir">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => loadEntries(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-500">{pagination.page} de {pagination.pages}</span>
          <button
            onClick={() => loadEntries(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            Próximo
          </button>
        </div>
      )}
    </div>
  )
}
