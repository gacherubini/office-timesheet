import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { TaskDetailContent } from '../projectBoard/TaskDetailContent'

export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [task, setTask] = useState(null)
  const [users, setUsers] = useState([])
  const [isLeader, setIsLeader] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  async function load() {
    setLoading(true); setNotFound(false)
    try {
      const [t, u] = await Promise.all([
        api.get(`/tasks/${id}`),
        api.get('/users/basic').catch(() => []),
      ])
      setTask(t)
      setUsers(Array.isArray(u) ? u : [])
      try {
        const leaders = await api.get(`/projects/${t.project_id}/leaders`)
        setIsLeader(leaders.some((l) => l.id === profile?.id))
      } catch { setIsLeader(false) }
    } catch (err) {
      if (err.message?.includes('não encontrada')) setNotFound(true)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <p className="text-sm text-text-secondary py-10 text-center">Carregando...</p>

  if (notFound || !task) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-text-secondary mb-4">Tarefa não encontrada.</p>
        <Link to="/project-board" className="text-sm text-accent hover:underline">
          Voltar ao quadro
        </Link>
      </div>
    )
  }

  const canManage = isAdmin || isLeader

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={() => navigate('/project-board')}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={13} /> Voltar ao quadro
        </button>
      </div>
      <div className="flex-1 relative bg-surface rounded-xl border border-border-subtle overflow-hidden">
        <TaskDetailContent
          task={task}
          users={users}
          canManage={canManage}
          currentUserId={profile?.id}
          isAdmin={isAdmin}
          onChanged={load}
          onDeleted={() => navigate('/project-board')}
        />
      </div>
    </div>
  )
}
