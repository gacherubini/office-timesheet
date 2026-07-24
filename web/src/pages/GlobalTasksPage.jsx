import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, Plus, Play, Square } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { Avatar } from '../components/Avatar'
import { KanbanBoard } from './projectBoard/KanbanBoard'
import { TaskDetailModal } from './projectBoard/TaskDetailModal'
import { NewTaskModal } from './projectBoard/NewTaskModal'
import { COLUMNS, urgency, urgencyClasses, formatShortDate, formatMinutes, formatClock } from './projectBoard/helpers'

// Board GLOBAL de tarefas: reúne todas as tarefas de todos os projetos, com
// filtros por projeto / responsável / "só minhas" e alternância Board / Lista.
export function GlobalTasksPage() {
  const { profile, isAdmin, isAdministrativeIntern, canManageProjects } = useAuth()
  const canClockIn = !isAdmin && !isAdministrativeIntern
  const [searchParams, setSearchParams] = useSearchParams()

  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [projectFilter, setProjectFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('board') // 'board' | 'list'
  const [drawer, setDrawer] = useState(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [timerBusyId, setTimerBusyId] = useState(null)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const tickRef = useRef(null)

  const runningTask = tasks.find((t) => t.open_started_at)

  useEffect(() => {
    clearInterval(tickRef.current)
    if (runningTask) {
      const start = new Date(runningTask.open_started_at).getTime()
      const tick = () => setTimerElapsed(Math.floor((Date.now() - start) / 1000))
      tick()
      tickRef.current = setInterval(tick, 1000)
    } else {
      setTimerElapsed(0)
    }
    return () => clearInterval(tickRef.current)
  }, [runningTask?.id, runningTask?.open_started_at])

  async function loadTasks() {
    setTasks(await api.get('/tasks'))
  }

  useEffect(() => {
    async function init() {
      try {
        const [tsk, proj, usr] = await Promise.all([
          api.get('/tasks'),
          api.get('/projects').catch(() => []),
          api.get('/users/basic').catch(() => []),
        ])
        setTasks(Array.isArray(tsk) ? tsk : [])
        setProjects(Array.isArray(proj) ? proj : [])
        setUsers(Array.isArray(usr) ? usr : [])
      } catch (err) {
        setFeedback(err.message || 'Não foi possível carregar as tarefas.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Deep-link ?task=<id> abre o detalhe.
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (loading || !taskId || drawer) return
    const found = tasks.find((t) => t.id === taskId)
    if (found) setDrawer(found)
    else api.get(`/tasks/${taskId}`).then((t) => setDrawer(t)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tasks, searchParams])

  function closeDrawer() {
    setDrawer(null)
    if (searchParams.get('task')) {
      searchParams.delete('task')
      setSearchParams(searchParams, { replace: true })
    }
  }

  async function toggleTimer(task) {
    setTimerBusyId(task.id)
    try {
      if (task.open_started_at) {
        await api.post(`/tasks/${task.id}/time/stop`, {})
      } else {
        if (runningTask && runningTask.id !== task.id) {
          await api.post(`/tasks/${runningTask.id}/time/stop`, {})
        }
        await api.post(`/tasks/${task.id}/time/start`, {})
      }
      await loadTasks()
    } catch (err) {
      setFeedback(err.message || 'Não foi possível atualizar o cronômetro.')
    } finally {
      setTimerBusyId(null)
    }
  }

  async function handleMove(task, status) {
    const prev = tasks
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, status } : t)))
    try {
      await api.put(`/tasks/${task.id}/status`, { status, position: 0 })
    } catch (err) {
      setTasks(prev)
      setFeedback(err.message || 'Não foi possível mover a tarefa.')
    }
  }

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (projectFilter && t.project_id !== projectFilter) return false
      if (onlyMine && t.assignee_id !== profile?.id) return false
      if (!onlyMine && assigneeFilter && t.assignee_id !== assigneeFilter) return false
      if (q && !`${t.title} ${t.project_name || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, projectFilter, assigneeFilter, onlyMine, search, profile?.id])

  const filters = (
    <div className="flex items-end gap-2 flex-wrap">
      <Select label="Projeto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-44">
        <option value="">Todos</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select
        label="Responsável"
        value={assigneeFilter}
        onChange={(e) => setAssigneeFilter(e.target.value)}
        className="w-44"
        disabled={onlyMine}
      >
        <option value="">Todos</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
      <button
        type="button"
        onClick={() => setOnlyMine((v) => !v)}
        className={`h-[38px] rounded-lg px-3 text-sm font-medium transition-colors ${
          onlyMine ? 'bg-accent text-white' : 'border border-border-subtle text-text-secondary hover:text-text-primary'
        }`}
      >
        Só minhas
      </button>
      <div className="flex h-[38px] items-center rounded-lg border border-border-subtle overflow-hidden">
        <button
          type="button"
          onClick={() => setView('board')}
          title="Board"
          className={`flex h-full items-center px-2.5 ${view === 'board' ? 'bg-surface-alt text-text-primary' : 'text-text-secondary'}`}
        >
          <LayoutGrid size={16} />
        </button>
        <button
          type="button"
          onClick={() => setView('list')}
          title="Lista"
          className={`flex h-full items-center px-2.5 ${view === 'list' ? 'bg-surface-alt text-text-primary' : 'text-text-secondary'}`}
        >
          <List size={16} />
        </button>
      </div>
      <Button onClick={() => setCreating(true)}>
        <Plus size={16} /> Nova
      </Button>
    </div>
  )

  return (
    <div>
      <PageHeader title="Tarefas" subtitle="Todas as tarefas, de todos os projetos" actions={filters} />

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título ou projeto..."
          className="w-full sm:w-96"
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
      ) : view === 'board' ? (
        <KanbanBoard
          tasks={visibleTasks}
          onOpenTask={(task) => setDrawer(task)}
          onMove={handleMove}
          currentUserId={canClockIn ? profile?.id : null}
          timerElapsed={timerElapsed}
          timerBusyId={timerBusyId}
          onToggleTimer={canClockIn ? toggleTimer : undefined}
        />
      ) : (
        <TaskList
          tasks={visibleTasks}
          onOpen={(t) => setDrawer(t)}
          currentUserId={canClockIn ? profile?.id : null}
          runningTaskId={runningTask?.id}
          timerElapsed={timerElapsed}
          timerBusyId={timerBusyId}
          onToggleTimer={canClockIn ? toggleTimer : undefined}
        />
      )}

      {drawer && (
        <TaskDetailModal
          task={drawer}
          users={users}
          canManage={canManageProjects}
          currentUserId={profile?.id}
          isAdmin={isAdmin}
          onClose={closeDrawer}
          onChanged={loadTasks}
          onDeleted={() => { closeDrawer(); loadTasks() }}
        />
      )}

      {creating && (
        <NewTaskModal
          projects={projects}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); loadTasks() }}
        />
      )}

      <Toast message={feedback} onClose={() => setFeedback('')} />
    </div>
  )
}

// Visão em lista: agrupada por coluna de status.
function TaskList({ tasks, onOpen, currentUserId, runningTaskId, timerElapsed, timerBusyId, onToggleTimer }) {
  const byStatus = useMemo(() => {
    const map = {}
    for (const col of COLUMNS) map[col.key] = []
    for (const t of tasks) if (map[t.status]) map[t.status].push(t)
    for (const col of COLUMNS) map[col.key].sort((a, b) => a.position - b.position)
    return map
  }, [tasks])

  return (
    <div className="space-y-5">
      {COLUMNS.map((col) => {
        const rows = byStatus[col.key]
        if (rows.length === 0) return null
        return (
          <div key={col.key}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{col.label}</span>
              <span className="text-[11px] text-text-secondary tabular-nums">· {rows.length}</span>
            </div>
            <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
              {rows.map((t) => {
                const u = urgency(t.due_date, t.status)
                const isRunning = Boolean(t.open_started_at)
                const canTime = Boolean(onToggleTimer && currentUserId && t.assignee_id === currentUserId && ['todo', 'in_progress'].includes(t.status))
                return (
                  <div
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className="flex items-center gap-3 px-4 py-2.5 bg-surface hover:bg-surface-alt/50 cursor-pointer transition-colors"
                  >
                    {canTime && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleTimer(t) }}
                        disabled={timerBusyId === t.id}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md flex-none disabled:opacity-50 ${
                          isRunning ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-600'
                        }`}
                      >
                        {isRunning ? <Square size={12} /> : <Play size={12} />}
                      </button>
                    )}
                    <span className="text-sm text-text-primary truncate flex-1 min-w-0">{t.title}</span>
                    {t.project_name && (
                      <span className="hidden sm:inline text-[11px] rounded-full bg-surface-alt px-2 py-0.5 text-text-secondary flex-none">
                        {t.project_name}
                      </span>
                    )}
                    {isRunning && (
                      <span className="text-[11px] tabular-nums text-emerald-500 font-medium flex-none">{formatClock(timerElapsed)}</span>
                    )}
                    {!isRunning && t.total_minutes > 0 && (
                      <span className="text-[11px] tabular-nums text-text-secondary flex-none">{formatMinutes(t.total_minutes)}</span>
                    )}
                    {t.due_date && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-none ${urgencyClasses(u.level === 'none' ? 'normal' : u.level)}`}>
                        {formatShortDate(t.due_date)}
                      </span>
                    )}
                    {t.assignee_id ? (
                      <Avatar name={t.assignee_name} url={t.assignee_avatar_url} size={22} />
                    ) : (
                      <span className="text-[11px] text-text-secondary/60 italic flex-none">sem resp.</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {tasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-subtle py-16 text-center text-sm text-text-secondary">
          Nenhuma tarefa encontrada com esses filtros.
        </div>
      )}
    </div>
  )
}
