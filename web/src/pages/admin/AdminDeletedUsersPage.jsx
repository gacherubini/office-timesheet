import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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

  useEffect(() => {
    loadUsers()
  }, [])

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

  return (
    <div>
      <PageHeader
        title="Colaboradores Excluídos"
        subtitle="Restaure colaboradores arquivados"
        badge={
          <Link
            to="/admin/team"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
        }
      />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Nome
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                E-mail
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Perfil
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Valor/Hora
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Excluído em
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-text-secondary">
                  Nenhum colaborador excluído.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{user.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone={user.role === 'admin' ? 'accent' : 'info'}>
                      {user.role === 'admin' ? 'Admin' : 'Colaborador'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-primary tabular-nums">
                    {formatCurrency(user.hourly_rate)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(user.deleted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRestore(user.id)}
                      disabled={restoringId === user.id}
                      className="inline-flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-400 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw size={14} />
                      {restoringId === user.id ? 'Restaurando...' : 'Restaurar'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
