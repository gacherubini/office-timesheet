import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Plus, X, Trash2, Pencil } from 'lucide-react'

export function AdminTimeEntriesPage() {
  const [entries, setEntries] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filters, setFilters] = useState({ user_id: '', project_id: '', start_date: '', end_date: '' })

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
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
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filters.user_id) params.set('user_id', filters.user_id)
      if (filters.project_id) params.set('project_id', filters.project_id)
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)

      const res = await api.get(`/admin/time-entries?${params}`)
      setEntries(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
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
    if (!confirm('Excluir este apontamento?')) return
    try {
      await api.delete(`/admin/time-entries/${id}`)
      loadEntries(pagination.page)
    } catch (err) {
      alert(err.message)
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function formatDuration(minutes) {
    if (!minutes) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}min`
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Apontamentos</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Apontamento Manual
        </button>
      </div>

      {/* Filtros */}
      <form onSubmit={handleFilter} className="bg-white rounded-lg shadow-sm border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Colaborador</label>
          <select
            value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Projeto</label>
          <select
            value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">De</label>
          <input type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Até</label>
          <input type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="bg-gray-900 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-gray-800">
          Filtrar
        </button>
      </form>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingEntry ? 'Editar Apontamento' : 'Apontamento Manual'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-3">
              {!editingEntry && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
                  <select required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">Selecione...</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projeto</label>
                <select required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Selecione...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
                <input type="datetime-local" required value={form.started_at}
                  onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
                <input type="datetime-local" required value={form.ended_at}
                  onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800">
                {editingEntry ? 'Salvar' : 'Criar Apontamento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Projeto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Início</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fim</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Duração</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Custo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum apontamento encontrado.</td></tr>
            ) : entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3">{entry.profiles?.name || '-'}</td>
                <td className="px-4 py-3">{entry.projects?.name || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{formatDateTime(entry.started_at)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDateTime(entry.ended_at)}</td>
                <td className="px-4 py-3">{formatDuration(entry.duration_minutes)}</td>
                <td className="px-4 py-3 font-medium">{formatCurrency(entry.cost_snapshot)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => startEdit(entry)} className="text-gray-400 hover:text-gray-700 mr-2"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => loadEntries(pagination.page - 1)} disabled={pagination.page <= 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30">Anterior</button>
          <span className="px-3 py-1 text-sm text-gray-500">{pagination.page} de {pagination.pages}</span>
          <button onClick={() => loadEntries(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30">Próximo</button>
        </div>
      )}
    </div>
  )
}
