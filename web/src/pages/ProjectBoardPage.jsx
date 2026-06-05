import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { KanbanBoard } from './projectBoard/KanbanBoard'
import { TaskModal } from './projectBoard/TaskModal'
import { LeaderManager } from './projectBoard/LeaderManager'

export function ProjectBoardPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [leaderProjectIds, setLeaderProjectIds] = useState([])
  const [projectFilter, setProjectFilter] = useState('')
  const [modal, setModal] = useState(null) // { task } | { task: null }
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === 'admin'

  async function loadTasks() {
    const q = projectFilter ? `?project_id=${projectFilter}` : ''
    setTasks(await api.get(`/tasks${q}`))
  }

  async function loadLeadership(projectList) {
    const flags = await Promise.all(
      projectList.map((p) =>
        api.get(`/projects/${p.id}/leaders`)
          .then((ls) => (ls.some((l) => l.id === profile?.id) ? p.id : null))
          .catch(() => null)
      )
    )
    setLeaderProjectIds(flags.filter(Boolean))
  }

  useEffect(() => {
    async function init() {
      try {
        const [proj, tk, usr] = await Promise.all([
          api.get('/projects'),
          api.get('/tasks'),
          api.get('/admin/users').catch(() => []),
        ])
        setProjects(proj)
        setTasks(tk)
        setUsers(Array.isArray(usr) ? usr : [])
        await loadLeadership(proj)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) loadTasks().catch((err) => console.error(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter])

  // Deep-link de notificação: /project-board?task=<id> abre a tarefa.
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (loading || !taskId || modal) return
    const found = tasks.find((t) => t.id === taskId)
    if (found) {
      setModal({ task: found })
    } else {
      api.get(`/tasks`).then((all) => {
        const t = all.find((x) => x.id === taskId)
        if (t) { setTasks((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t])); setModal({ task: t }) }
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tasks, searchParams])

  function closeModal() {
    setModal(null)
    if (searchParams.get('task')) {
      searchParams.delete('task')
      setSearchParams(searchParams, { replace: true })
    }
  }

  function canManageProject(projectId) {
    return isAdmin || leaderProjectIds.includes(projectId)
  }

  async function handleMove(task, status) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
    try {
      await api.put(`/tasks/${task.id}/status`, { status, position: 0 })
    } catch (err) {
      console.error(err)
      loadTasks().catch(() => {})
    }
  }

  const canCreate = projectFilter && canManageProject(projectFilter)

  return (
    <div>
      <PageHeader title="Gerenciamento de Projetos" subtitle="Quadro de tarefas do escritório" />

      <div className="mb-5 flex items-end gap-3">
        <Select
          label="Projeto"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="w-64"
        >
          <option value="">Todos os projetos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        {canCreate && (
          <Button onClick={() => setModal({ task: null })}>Nova tarefa</Button>
        )}
      </div>

      {isAdmin && projectFilter && (
        <LeaderManager
          projectId={projectFilter}
          users={users}
          onChange={() => loadLeadership(projects)}
        />
      )}

      {loading ? (
        <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
      ) : (
        <KanbanBoard tasks={tasks} onOpenTask={(task) => setModal({ task })} onMove={handleMove} />
      )}

      {modal && (
        <TaskModal
          task={modal.task}
          projectId={modal.task?.project_id || projectFilter}
          users={users}
          canManage={canManageProject(modal.task?.project_id || projectFilter)}
          currentUserId={profile?.id}
          isAdmin={isAdmin}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadTasks() }}
          onDeleted={() => { closeModal(); loadTasks() }}
          onChanged={() => loadTasks()}
        />
      )}
    </div>
  )
}
