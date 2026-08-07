import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { ROLES, roleLabel } from '../../lib/permissions'

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

function roleBadgeTone(role) {
  if (role === ROLES.ADMIN) return 'accent'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'warning'
  return 'info'
}

function compensationLabel(user) {
  if (user.role === ROLES.ADMINISTRATIVE_INTERN) {
    return `${formatCurrency(user.fixed_salary)} / mês`
  }

  return `${formatCurrency(user.hourly_rate)} / hora`
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
            to="/pessoas"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
        }
      />

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-bg">
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Nome
              </th>
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                E-mail
              </th>
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Perfil
              </th>
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Remuneração
              </th>
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Excluído em
              </th>
              <th className="text-right px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
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
                  className="border-b border-border-subtle last:border-b-0 transition-colors hover:bg-[color:var(--color-hover)]"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{user.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone={roleBadgeTone(user.role)}>
                      {roleLabel(user.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-primary tabular-nums">
                    {compensationLabel(user)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(user.deleted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRestore(user.id)}
                      disabled={restoringId === user.id}
                      className="inline-flex items-center gap-1.5 border border-border-subtle px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
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
