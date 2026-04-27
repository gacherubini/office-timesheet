import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export function HistoryPage() {
  const [entries, setEntries] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)

  async function loadHistory(page = 1) {
    setLoading(true)
    try {
      const res = await api.get(`/me/history?page=${page}&limit=15`)
      setEntries(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  function formatDuration(minutes) {
    if (!minutes) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}min`
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Meu Histórico</h1>

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Projeto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Duração</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  Carregando...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  Nenhum apontamento encontrado.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{formatDate(entry.started_at)}</td>
                  <td className="px-4 py-3">{entry.projects?.name || '-'}</td>
                  <td className="px-4 py-3">{formatDuration(entry.duration_minutes)}</td>
                  <td className="px-4 py-3">{statusLabel(entry.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
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
    </div>
  )
}
