import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, AlertTriangle, CheckCircle2, LayoutTemplate } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Input, Select } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'
import { TaskDetailModal } from './projectBoard/TaskDetailModal'
import { NewTaskModal } from './projectBoard/NewTaskModal'
import { ProjectCatalog } from './projectBoard/ProjectCatalog'
import { ProjectPage } from './projectBoard/ProjectPage'
import { TemplateManager } from './projectBoard/TemplateManager'

export function ProjectBoardPage() {
  const { profile, isAdmin, isAdministrativeIntern, canManageProjects } = useAuth()
  // Só quem bate ponto (colaborador / gestor de projetos) pode apontar horas —
  // admin e estagiário administrativo não iniciam apontamentos.
  const canClockIn = !isAdmin && !isAdministrativeIntern
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState([])
  const [taskCounts, setTaskCounts] = useState([]) // [{ project_id, total, todo, ... }]
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [templates, setTemplates] = useState([])
  const [users, setUsers] = useState([])
  const [view, setView] = useState('catalog') // 'catalog' | 'templates'
  const [projectFilter, setProjectFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('') // '', 'me' ou user id
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null) // task object
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [timerBusyId, setTimerBusyId] = useState(null)
  const [timerElapsed, setTimerElapsed] = useState(0)
  const tickRef = useRef(null)

  // Apontamento de horas (time-entry) — 1 por vez, controlado no card do catálogo.
  const [activeTimer, setActiveTimer] = useState(null)
  const [entryElapsed, setEntryElapsed] = useState(0)
  const [entryBusy, setEntryBusy] = useState(false)
  const entryTickRef = useRef(null)

  // Gestão de projetos (catálogo): criar/editar/excluir/imagem.
  const [showForm, setShowForm] = useState(false)
  const [showNoClient, setShowNoClient] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [form, setForm] = useState({ name: '', client_id: '', address: '', start_date: '', status: 'active' })
  const [formError, setFormError] = useState('')
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const uploadingRef = useRef(null)
  const fileInputRef = useRef(null)

  // Tarefa com cronômetro aberto pelo usuário logado (uma de cada vez).
  const runningTask = tasks.find((t) => t.open_started_at)

  // Contador ao vivo da sessão em andamento; reinicia a cada nova sessão.
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

  // Play/stop direto no card. Iniciar uma tarefa encerra a anterior (uma por vez).
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

  // ── Apontamento de horas (time-entry) no card do catálogo ─────────
  async function loadActiveTimer() {
    try {
      const t = await api.get('/me/active-timer')
      // A API reporta paused=true quando o apontamento ainda não tem nenhuma
      // pausa registrada (recém-iniciado). Só é pausa real quando há paused_at.
      if (t) t.paused = Boolean(t.paused && t.paused_at)
      setActiveTimer(t)
    } catch (err) {
      console.error(err)
    }
  }

  // Relógio ao vivo: (ref - início) - pausas fechadas. Pausado congela em paused_at.
  useEffect(() => {
    clearInterval(entryTickRef.current)
    if (!activeTimer) {
      setEntryElapsed(0)
      return
    }
    const start = new Date(activeTimer.started_at).getTime()
    const base = activeTimer.total_paused_seconds || 0
    const compute = () => {
      const ref = activeTimer.paused && activeTimer.paused_at
        ? new Date(activeTimer.paused_at).getTime()
        : Date.now()
      setEntryElapsed(Math.max(0, Math.floor((ref - start) / 1000) - base))
    }
    compute()
    if (!activeTimer.paused) entryTickRef.current = setInterval(compute, 1000)
    return () => clearInterval(entryTickRef.current)
  }, [activeTimer?.id, activeTimer?.paused, activeTimer?.paused_at, activeTimer?.total_paused_seconds, activeTimer?.started_at])

  // Iniciar apontamento num projeto. Só 1 por vez: encerra o anterior antes.
  async function startEntry(project) {
    setEntryBusy(true)
    try {
      if (activeTimer) await api.post('/time-entries/stop', {})
      await api.post('/time-entries/start', { project_id: project.id })
      await loadActiveTimer()
    } catch (err) {
      setFeedback(err.message || 'Não foi possível iniciar o apontamento.')
    } finally {
      setEntryBusy(false)
    }
  }

  async function entryAction(path) {
    setEntryBusy(true)
    try {
      await api.post(`/time-entries/${path}`, {})
      await loadActiveTimer()
    } catch (err) {
      setFeedback(err.message || 'Não foi possível atualizar o apontamento.')
    } finally {
      setEntryBusy(false)
    }
  }

  async function loadTasks() {
    const q = projectFilter ? `?project_id=${projectFilter}` : ''
    setTasks(await api.get(`/tasks${q}`))
  }

  // Contagem por projeto pro catálogo (agregada no banco, leve).
  async function loadCounts() {
    try {
      setTaskCounts(await api.get('/tasks/counts'))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadProjects() {
    try {
      setProjects(await api.get('/projects'))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadTemplates() {
    if (!canManageProjects) return
    try {
      setTemplates(await api.get('/project-templates'))
    } catch (err) {
      console.error(err)
    }
  }

  // ── Gestão de projetos no catálogo ────────────────────────────────
  function resetProjectForm() {
    setForm({ name: '', client_id: '', address: '', start_date: '', status: 'active', template_id: '' })
    setEditingProject(null)
    setShowForm(false)
    setFormError('')
  }

  function startCreateProject() {
    // Antes de criar um projeto é preciso ter ao menos um cliente cadastrado.
    if (clients.length === 0) {
      setShowNoClient(true)
      return
    }
    resetProjectForm()
    setShowForm(true)
  }

  function startEditProject(project) {
    setForm({
      name: project.name,
      client_id: project.client_id || '',
      address: project.address || '',
      start_date: project.start_date || '',
      status: project.status,
      template_id: '',
    })
    setEditingProject(project)
    setShowForm(true)
    setFormError('')
  }

  async function handleProjectSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Informe o nome do projeto.'); return }
    if (!form.client_id) { setFormError('Selecione um cliente.'); return }
    if (!form.start_date) { setFormError('Informe a data de início.'); return }
    try {
      const wasEditing = Boolean(editingProject)
      const payload = {
        name: form.name.trim(),
        client_id: form.client_id,
        address: form.address.trim() || null,
        start_date: form.start_date,
      }
      if (wasEditing) {
        await api.put(`/projects/${editingProject.id}`, { ...payload, status: form.status })
      } else {
        await api.post('/projects', { ...payload, template_id: form.template_id || null })
      }
      resetProjectForm()
      await loadProjects()
      loadCounts()
      setSuccessMessage(wasEditing ? 'Projeto atualizado com sucesso!' : 'Projeto cadastrado com sucesso!')
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function handleProjectDelete() {
    if (!projectToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectToDelete.id}`)
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id))
      setProjectToDelete(null)
      setSuccessMessage('Projeto excluído com sucesso!')
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  function pickProjectImage(project) {
    uploadingRef.current = project.id
    fileInputRef.current?.click()
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    const projectId = uploadingRef.current
    if (!file || !projectId) return
    const formData = new FormData()
    formData.append('image', file)
    try {
      const token = localStorage.getItem('access_token')
      const baseUrl = import.meta.env.VITE_API_URL ?? '/api'
      const res = await fetch(`${baseUrl}/projects/${projectId}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      await loadProjects()
    } catch (err) {
      setFeedback(err.message || 'Erro ao enviar imagem.')
    } finally {
      uploadingRef.current = null
      e.target.value = ''
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const [proj, counts, usr, cli, tpl] = await Promise.all([
          api.get('/projects'),
          api.get('/tasks/counts'),
          api.get('/users/basic').catch(() => []),
          api.get('/admin/clients').catch(() => []),
          canManageProjects ? api.get('/project-templates').catch(() => []) : Promise.resolve([]),
        ])
        setProjects(proj)
        setTaskCounts(Array.isArray(counts) ? counts : [])
        setUsers(Array.isArray(usr) ? usr : [])
        setClients(Array.isArray(cli) ? cli : [])
        setTemplates(Array.isArray(tpl) ? tpl : [])
        loadActiveTimer()
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
    if (loading) return
    if (projectFilter) {
      loadTasks().catch((err) => console.error(err))
    } else {
      // Voltou pro catálogo: não precisa das tarefas, só recarrega as contagens.
      setTasks([])
      loadCounts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter])

  // Deep-link: /project-board?project=<id> abre o quadro daquele projeto.
  useEffect(() => {
    const pid = searchParams.get('project')
    if (loading || !pid) return
    setView('catalog')
    setProjectFilter(pid)
    searchParams.delete('project')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams])

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
      {!projectFilter && view === 'templates' ? (
        // ── Gestão de templates (3º "nível" da página Projetos) ────────
        <TemplateManager
          templates={templates}
          onBack={() => setView('catalog')}
          onChanged={loadTemplates}
        />
      ) : !projectFilter ? (
        // ── Nível 1: catálogo de projetos ──────────────────────────────
        <>
          <PageHeader
            title="Gerenciamento de Projetos"
            subtitle="Escolha um projeto para ver suas tarefas"
            actions={
              canManageProjects && (
                <>
                  {isAdmin && (
                    <Link
                      to="/admin/deleted-projects"
                      className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                      <Trash2 size={14} />
                      Excluídos
                    </Link>
                  )}
                  <Button variant="secondary" onClick={() => setView('templates')}>
                    <LayoutTemplate size={16} />
                    Templates
                  </Button>
                  <Button onClick={startCreateProject}>
                    <Plus size={16} />
                    Novo Projeto
                  </Button>
                </>
              )
            }
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
            <ProjectCatalog
              projects={projects}
              counts={taskCounts}
              search={search}
              onOpen={openProject}
              canManage={canManageProjects}
              canDelete={isAdmin}
              onEdit={startEditProject}
              onDelete={(p) => { setProjectToDelete(p); setDeleteError('') }}
              onPickImage={pickProjectImage}
            />
          )}
        </>
      ) : (
        // ── Nível 2: página do projeto (layout do mockup) ──────────────
        <ProjectPage
          project={selectedProject}
          onBack={backToCatalog}
          onProjectChanged={loadProjects}
          canManage={canManageProjects}
          loading={loading}
          tasks={visibleTasks}
          onOpenTask={(task) => setDrawer(task)}
          onMove={handleMove}
          currentUserId={profile?.id}
          taskTimerElapsed={timerElapsed}
          timerBusyId={timerBusyId}
          onToggleTimer={toggleTimer}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          search={search}
          setSearch={setSearch}
          users={users}
          onNewTask={() => setCreating(true)}
          canCreate={canCreate}
          canClockIn={canClockIn}
          activeTimer={activeTimer}
          entryElapsed={entryElapsed}
          entryBusy={entryBusy}
          onStartEntry={startEntry}
          onStopEntry={() => entryAction('stop')}
          onPauseEntry={() => entryAction('pause')}
          onResumeEntry={() => entryAction('resume')}
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

      {creating && projectFilter && (
        <NewTaskModal
          projectId={projectFilter}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); loadTasks() }}
        />
      )}

      {/* Upload de imagem do projeto (acionado pelo card do catálogo) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Criar / editar projeto */}
      <Modal
        open={showForm}
        onClose={resetProjectForm}
        title={editingProject ? 'Editar Projeto' : 'Novo Projeto'}
      >
        {formError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {formError}
          </div>
        )}
        <form onSubmit={handleProjectSubmit} className="space-y-3">
          <Input
            label="Nome do Projeto"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Cliente"
            required
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          >
            <option value="">Selecione um cliente...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <DateField
            label="Data de início"
            required
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <Input
            label="Endereço"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Opcional"
          />
          {!editingProject && templates.length > 0 && (
            <Select
              label="Template (opcional)"
              value={form.template_id}
              onChange={(e) => setForm({ ...form, template_id: e.target.value })}
            >
              <option value="">Nenhum — projeto vazio</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.item_count} tasks)</option>
              ))}
            </Select>
          )}
          {editingProject && (
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Ativo</option>
              <option value="completed">Concluído</option>
            </Select>
          )}
          <Button type="submit" className="w-full">
            {editingProject ? 'Salvar' : 'Criar Projeto'}
          </Button>
        </form>
      </Modal>

      {/* Sem cliente cadastrado: precisa de um antes de criar projeto */}
      <Modal
        open={showNoClient}
        onClose={() => setShowNoClient(false)}
        size="sm"
        title="Cadastre um cliente primeiro"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNoClient(false)}>Fechar</Button>
            <Link to="/admin/clients" onClick={() => setShowNoClient(false)}>
              <Button>Ir para Clientes</Button>
            </Link>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Todo projeto precisa estar vinculado a um cliente. Cadastre ao menos um cliente
          antes de criar um projeto.
        </p>
      </Modal>

      {/* Confirmar exclusão de projeto */}
      <Modal
        open={Boolean(projectToDelete)}
        onClose={() => { setProjectToDelete(null); setDeleteError('') }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => { setProjectToDelete(null); setDeleteError('') }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleProjectDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="bg-rose-500/15 rounded-full p-4 mb-4">
            <AlertTriangle className="text-rose-500" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">Excluir projeto?</h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{projectToDelete?.name}</strong>
          </p>
        </div>
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">Os apontamentos serão preservados.</p>
          <p className="text-text-secondary">
            Você pode restaurar este projeto a qualquer momento na página de{' '}
            <strong className="text-text-primary">Excluídos</strong>.
          </p>
        </div>
        {deleteError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mt-3">
            {deleteError}
          </div>
        )}
      </Modal>

      {/* Sucesso */}
      <Modal
        open={Boolean(successMessage)}
        onClose={() => setSuccessMessage('')}
        size="sm"
        footer={<Button onClick={() => setSuccessMessage('')}>OK</Button>}
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>

      <Toast message={feedback} onClose={() => setFeedback('')} />
    </div>
  )
}
