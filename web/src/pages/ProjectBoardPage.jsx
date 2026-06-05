import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { KanbanBoard } from './projectBoard/KanbanBoard'
import { TaskDrawer } from './projectBoard/TaskDrawer'
import { NewTaskModal } from './projectBoard/NewTaskModal'
import { LeaderManager } from './projectBoard/LeaderManager'

export function ProjectBoardPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [leaderProjectIds, setLeaderProjectIds] = useState([])
  const [projectFilter, setProjectFilter] = useState('')
  const [drawer, setDrawer] = useState(null) // task object
  const [creating, setCreating] = useState(false)
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
          api.get('/users/basic').catch(() => []),
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

  // Deep-link legado: /project-board?task=<id> abre o drawer.
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (loading || !taskId || drawer) return
    const found = tasks.find((t) => t.id === taskId)
    if (found) {
      setDrawer(found)
    } else {
      api.get(`/tasks/${taskId}`).then((t) => setDrawer(t)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tasks, searchParams])

  function closeDrawer() {
    setDrawer(null)
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
          <Button onClick={() => setCreating(true)}>Nova tarefa</Button>
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
        <KanbanBoard tasks={tasks} onOpenTask={(task) => setDrawer(task)} onMove={handleMove} />
      )}

      {drawer && (
        <TaskDrawer
          task={drawer}
          users={users}
          canManage={canManageProject(drawer.project_id)}
          currentUserId={profile?.id}
          isAdmin={isAdmin}
          onClose={closeDrawer}
          onChanged={loadTasks}
          onDeleted={() => { closeDrawer(); loadTasks() }}
        />
      )}

      {creating && projectFilter && (
        <NewTaskModal
          projectId={projectFilter}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); loadTasks() }}
        />
      )}
    </div>
  )
}
