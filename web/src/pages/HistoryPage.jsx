import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(minutes) {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

function toLocalInputValue(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function statusLabel(status) {
  const map = {
    completed: { text: 'Concluído', cls: 'bg-green-100 text-green-700' },
    running: { text: 'Em andamento', cls: 'bg-blue-100 text-blue-700' },
    paused: { text: 'Pausado', cls: 'bg-yellow-100 text-yellow-700' },
  }
  const s = map[status] || { text: status, cls: 'bg-gray-100 text-gray-700' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
}

function requestStatusLabel(status) {
  const map = {
    pending: { text: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
    approved: { text: 'Aprovada', cls: 'bg-green-100 text-green-700' },
    rejected: { text: 'Recusada', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] || { text: status, cls: 'bg-gray-100 text-gray-700' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
}

export function HistoryPage() {
  const [entries, setEntries] = useState([])
  const [projects, setProjects] = useState([])
  const [requests, setRequests] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [form, setForm] = useState({
    requested_project_id: '',
    requested_started_at: '',
    requested_ended_at: '',
    reason: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const requestsByEntryId = useMemo(() => {
    return requests.reduce((acc, request) => {
      if (!acc[request.time_entry_id] || request.status === 'pending') {
        acc[request.time_entry_id] = request
      }
      return acc
    }, {})
  }, [requests])

  async function loadRequests() {
    const data = await api.get('/me/time-entry-change-requests')
    setRequests(data)
  }

  async function loadHistory(page = 1) {
    setLoading(true)
    setError('')
    try {
      const [historyRes, projectRes, requestRes] = await Promise.all([
        api.get(`/me/history?page=${page}&limit=15`),
        api.get('/projects'),
        api.get('/me/time-entry-change-requests'),
      ])
      setEntries(historyRes.data)
      setPagination(historyRes.pagination)
      setProjects(projectRes)
      setRequests(requestRes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  function openRequestModal(entry) {
    setSelectedEntry(entry)
    setForm({
      requested_project_id: entry.project_id || '',
      requested_started_at: toLocalInputValue(entry.started_at),
      requested_ended_at: toLocalInputValue(entry.ended_at),
      reason: '',
    })
    setError('')
    setSuccess('')
  }

  function closeRequestModal() {
    setSelectedEntry(null)
    setSubmitting(false)
    setForm({
      requested_project_id: '',
      requested_started_at: '',
      requested_ended_at: '',
      reason: '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedEntry) return

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      await api.post('/me/time-entry-change-requests', {
        time_entry_id: selectedEntry.id,
        ...form,
      })
      await loadRequests()
      setSuccess('Solicitação enviada para aprovação do administrador.')
      closeRequestModal()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Meu Histórico</h1>
        {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">{success}</p>}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Projeto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Início</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Saída</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Duração</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitação</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  Carregando...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  Nenhum apontamento encontrado.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const request = requestsByEntryId[entry.id]
                const hasPendingRequest = request?.status === 'pending'
                const canRequest = entry.status === 'completed' && !hasPendingRequest

                return (
                  <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(entry.started_at)}</td>
                    <td className="px-4 py-3 min-w-40">{entry.projects?.name || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTime(entry.started_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTime(entry.ended_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDuration(entry.duration_minutes)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{statusLabel(entry.status)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {request ? requestStatusLabel(request.status) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openRequestModal(entry)}
                        disabled={!canRequest}
                        className="px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Solicitar alteração
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => loadHistory(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-500">
            {pagination.page} de {pagination.pages}
          </span>
          <button
            onClick={() => loadHistory(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            Próximo
          </button>
        </div>
      )}

      {selectedEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl border w-full max-w-lg">
            <div className="px-5 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Solicitar alteração de ponto</h2>
              <p className="text-sm text-gray-500 mt-1">
                {formatDate(selectedEntry.started_at)} · {selectedEntry.projects?.name || 'Sem projeto'}
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projeto correto</label>
                <select
                  value={form.requested_project_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, requested_project_id: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                >
                  <option value="">Selecione um projeto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início correto</label>
                  <input
                    type="datetime-local"
                    value={form.requested_started_at}
                    onChange={(e) => setForm((prev) => ({ ...prev, requested_started_at: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Saída correta</label>
                  <input
                    type="datetime-local"
                    value={form.requested_ended_at}
                    onChange={(e) => setForm((prev) => ({ ...prev, requested_ended_at: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-24 resize-y focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRequestModal}
                className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
              >
                {submitting ? 'Enviando...' : 'Enviar solicitação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
