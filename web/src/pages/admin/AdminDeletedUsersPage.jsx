import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { ArrowLeft, RotateCcw } from 'lucide-react'

export function AdminDeletedUsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState(null)
  const [error, setError] = useState('')

  async function loadUsers() {
    try {
      const data = await api.get('/admin/users/deleted')
      setUsers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  async function handleRestore(id) {
    setError('')
    setRestoringId(id)
    try {
      await api.post(`/admin/users/${id}/restore`, {})
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setRestoringId(null)
    }
  }

  function formatDate(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/team" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Colaboradores Excluídos</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Valor/Hora</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Excluído em</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum colaborador excluído.</td></tr>
            ) : users.map((user) => (
              <tr key={user.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-700">{user.name}</td>
                <td className="px-4 py-3 text-gray-500">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {user.role === 'admin' ? 'Admin' : 'Colaborador'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatCurrency(user.hourly_rate)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(user.deleted_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRestore(user.id)}
                    disabled={restoringId === user.id}
                    className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    {restoringId === user.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
