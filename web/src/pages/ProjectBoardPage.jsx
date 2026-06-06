import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { KanbanBoard } from './projectBoard/KanbanBoard'
import { TaskDetailModal } from './projectBoard/TaskDetailModal'
import { NewTaskModal } from './projectBoard/NewTaskModal'
import { LeaderManager } from './projectBoard/LeaderManager'
import { ProjectCatalog } from './projectBoard/ProjectCatalog'

export function ProjectBoardPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [leaderProjectIds, setLeaderProjectIds] = useState([])
  const [projectFilter, setProjectFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('') // '', 'me' ou user id
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null) // task object
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')

  const isAdmin = profile?.role === 'admin'

  async function loadTasks() {
    const q = projectFilter ? `?project_id=${projectFilter}` : ''
    setTasks(await api.get(`/tasks${q}`))
  }

  async function loadLeadership() {
    try {
      const ids = await api.get('/me/leadership')
      setLeaderProjectIds(Array.isArray(ids) ? ids : [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const [proj, tk, usr, lead] = await Promise.all([
          api.get('/projects'),
          api.get('/tasks'),
          api.get('/users/basic').catch(() => []),
          api.get('/me/leadership').catch(() => []),
        ])
        setProjects(proj)
        setTasks(tk)
        setUsers(Array.isArray(usr) ? usr : [])
        setLeaderProjectIds(Array.isArray(lead) ? lead : [])
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

  function openProject(project) {
    setSearch('')
    setAssigneeFilter('')
    setProjectFilter(project.id)
  }

  function backToCatalog() {
    setSearch('')
    setAssigneeFilter('')
    setProjectFilter('')
  }

  async function handleMove(task, status) {
    const prev = tasks
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, status } : t)))
    try {
      await api.put(`/tasks/${task.id}/status`, { status, position: 0 })
    } catch (err) {
      setTasks(prev) // desfaz o movimento otimista
      setFeedback(err.message || 'Não foi possível mover a tarefa.')
    }
  }

  // Filtros client-side: responsável + busca por título/projeto.
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (assigneeFilter === 'me' && t.assignee_id !== profile?.id) return false
      if (assigneeFilter && assigneeFilter !== 'me' && t.assignee_id !== assigneeFilter) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, assigneeFilter, search, profile?.id])

  const selectedProject = projects.find((p) => p.id === projectFilter)
  // Criar tarefa: liberado a qualquer usuário (só excluir exige admin/líder).
  const canCreate = Boolean(projectFilter)

  return (
    <div>
      {!projectFilter ? (
        // ── Nível 1: catálogo de projetos ──────────────────────────────
        <>
          <PageHeader
            title="Gerenciamento de Projetos"
            subtitle="Escolha um projeto para ver suas tarefas"
          />
          <div className="mb-5">
            <Input
              label="Buscar projeto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou cliente..."
              className="w-72"
            />
          </div>
          {loading ? (
            <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
          ) : (
            <ProjectCatalog projects={projects} tasks={tasks} search={search} onOpen={openProject} />
          )}
        </>
      ) : (
        // ── Nível 2: quadro do projeto selecionado ─────────────────────
        <>
          <button
            type="button"
            onClick={backToCatalog}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={14} />
            Todos os projetos
          </button>

          <PageHeader
            title={selectedProject?.name || 'Projeto'}
            subtitle={selectedProject?.client || 'Quadro de tarefas'}
          />

          <div className="mb-5 flex flex-wrap items-end gap-3">
            <Select
              label="Responsável"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-52"
            >
              <option value="">Todos</option>
              <option value="me">Minhas tarefas</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Input
              label="Buscar tarefa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Título da tarefa..."
              className="w-60"
            />
            {canCreate && (
              <Button onClick={() => setCreating(true)}>Nova tarefa</Button>
            )}
          </div>

          {isAdmin && (
            <LeaderManager
              projectId={projectFilter}
              users={users}
              onChange={loadLeadership}
            />
          )}

          {loading ? (
            <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
          ) : (
            <KanbanBoard tasks={visibleTasks} onOpenTask={(task) => setDrawer(task)} onMove={handleMove} />
          )}
        </>
      )}

      {drawer && (
        <TaskDetailModal
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

      <Toast message={feedback} onClose={() => setFeedback('')} />
    </div>
  )
}
