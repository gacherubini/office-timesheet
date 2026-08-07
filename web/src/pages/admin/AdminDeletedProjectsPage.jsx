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

export function AdminDeletedProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState(null)
  const [error, setError] = useState('')

  async function loadProjects() {
    try {
      const data = await api.get('/projects/deleted')
      setProjects(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function handleRestore(id) {
    setError('')
    setRestoringId(id)
    try {
      await api.post(`/projects/${id}/restore`, {})
      setProjects((prev) => prev.filter((project) => project.id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Projetos Excluídos"
        subtitle="Restaure projetos arquivados"
        badge={
          <Link
            to="/project-board"
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
                Cliente
              </th>
              <th className="text-left px-4 py-3 font-medium text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Status
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
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Nenhum projeto excluído.
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-border-subtle last:border-b-0 transition-colors hover:bg-[color:var(--color-hover)]"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{project.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{project.client || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={project.status === 'active' ? 'success' : 'neutral'}>
                      {project.status === 'active' ? 'Ativo' : 'Concluído'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(project.deleted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRestore(project.id)}
                      disabled={restoringId === project.id}
                      className="inline-flex items-center gap-1.5 border border-border-subtle px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
                    >
                      <RotateCcw size={14} />
                      {restoringId === project.id ? 'Restaurando...' : 'Restaurar'}
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
