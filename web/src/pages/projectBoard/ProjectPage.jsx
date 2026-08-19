import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, FileText, Upload, Trash2, User, MapPin, Phone, Plus, Pencil, Save, X, Clock3,
  Play, Pause, Square, Settings,
} from 'lucide-react'
import { api } from '../../lib/api'
import { carimbarContexto } from '../../lib/agentContext'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { KanbanBoard } from './KanbanBoard'
import { StageTrack } from './StageTrack'
import { StageManagerModal } from './StageManagerModal'
import { PAPEIS_CLIENTE } from './ProjectClientsField'
import { formatMinutes, formatClock } from './helpers'

function papelClienteLabel(role) {
  return PAPEIS_CLIENTE.find((p) => p.value === role)?.label || role
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectPage({
  project, onBack, onProjectChanged, canManage = false, loading = false,
  // board
  tasks, onOpenTask, onMove, currentUserId, taskTimerElapsed, timerBusyId, onToggleTimer,
  // filtros
  assigneeFilter, setAssigneeFilter, search, setSearch, users, onNewTask, canCreate,
  // apontamento (time-entry) do projeto — mesmo controle do card do catálogo
  canClockIn = false, activeTimer, entryElapsed = 0, entryBusy = false,
  onStartEntry, onStopEntry, onPauseEntry, onResumeEntry,
}) {
  const [hours, setHours] = useState({ today_minutes: 0, month_minutes: 0 })
  const [documents, setDocuments] = useState([])
  const [docBusy, setDocBusy] = useState(false)
  const [editingBriefing, setEditingBriefing] = useState(false)
  const [briefingDraft, setBriefingDraft] = useState(project?.briefing || '')
  const [briefingBusy, setBriefingBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const fileRef = useRef(null)

  // Trilha de etapas (item 8 do PDF): a lista vem de GET /projects/:id/stages
  // (Task 7 do backend). etapaAtiva filtra o quadro; null = todas as etapas.
  const [stages, setStages] = useState([])
  const [etapaAtiva, setEtapaAtiva] = useState(null)
  const [showStageManager, setShowStageManager] = useState(false)

  // Contratantes do projeto (item 7 do PDF): GET /projects/:id/stages não traz
  // isto — o `project` recebido do catálogo (GET /projects) também não. É
  // preciso buscar a ficha completa (GET /projects/:id) para os `clients[]`.
  const [clients, setClients] = useState([])

  const completed = project?.status === 'completed'

  // Quadro filtrado pela etapa ativa na trilha — "clico em 'anteprojeto' e o
  // quadro mostra só as tarefas dessa etapa" (aceite do item 8).
  const filteredTasks = etapaAtiva ? (tasks || []).filter((t) => t.stage_id === etapaAtiva) : tasks
  const etapaAtivaObj = etapaAtiva ? stages.find((s) => s.id === etapaAtiva) : null
  const boardTitle = etapaAtivaObj ? `Tarefas · ${etapaAtivaObj.name}` : 'Tarefas · Todas as etapas'

  // Apontamento do projeto: mesmo estado usado no card do catálogo.
  const isTiming = activeTimer?.project_id === project?.id
  const isPaused = isTiming && activeTimer?.paused
  const showTimer = Boolean(canClockIn && onStartEntry) && !completed

  async function loadHours() {
    try {
      setHours(await api.get(`/projects/${project.id}/my-hours`))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadDocuments() {
    try {
      setDocuments(await api.get(`/projects/${project.id}/documents`))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadStages() {
    try {
      setStages(await api.get(`/projects/${project.id}/stages`))
    } catch (err) {
      console.error(err)
    }
  }

  async function loadClients() {
    try {
      const full = await api.get(`/projects/${project.id}`)
      setClients(full.clients || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!project?.id) return
    loadHours()
    loadDocuments()
    loadStages()
    loadClients()
    setBriefingDraft(project.briefing || '')
    setEditingBriefing(false)
    setEtapaAtiva(null)
    // Contexto para o chat: o projeto aberto agora (não o último visitado
    // na listagem, que é o que ProjectBoardPage.jsx carimba).
    carimbarContexto({ projectId: project.id, projectName: project.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // Recarrega horas quando o apontamento é encerrado/iniciado (activeTimer muda).
  useEffect(() => {
    if (project?.id) loadHours()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer?.id])

  async function saveBriefing() {
    setBriefingBusy(true)
    try {
      await api.put(`/projects/${project.id}`, { briefing: briefingDraft })
      setEditingBriefing(false)
      onProjectChanged?.()
    } catch (err) {
      setFeedback(err.message || 'Não foi possível salvar o briefing.')
    } finally {
      setBriefingBusy(false)
    }
  }

  async function handleUploadDoc(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setDocBusy(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const token = localStorage.getItem('access_token')
      const baseUrl = import.meta.env.VITE_API_URL ?? '/api'
      const res = await fetch(`${baseUrl}/projects/${project.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status}`)
      }
      await loadDocuments()
    } catch (err) {
      setFeedback(err.message || 'Erro ao anexar documento.')
    } finally {
      setDocBusy(false)
      e.target.value = ''
    }
  }

  async function deleteDoc(doc) {
    try {
      await api.delete(`/projects/${project.id}/documents/${doc.id}`)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setFeedback(err.message || 'Não foi possível excluir o documento.')
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} />
        Todos os projetos
      </button>

      {/* Cabeçalho do projeto */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-text-primary leading-tight truncate">{project?.name}</h1>
          {project?.client && (
            <p className="text-sm text-text-secondary mt-0.5">Cliente: {project.client}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap md:pr-12">
          <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-medium ${
            completed ? 'state-success-soft' : 'bg-accent/15 text-accent'
          }`}>
            {completed ? 'Concluído' : 'Em andamento'}
          </span>
        </div>
      </div>

      {/* Trilha de etapas — "fica no topo da página do projeto, mostrando o
          que já fechou, onde o projeto está e o que vem" (item 8 do PDF) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-medium text-text-secondary">Etapas do projeto</h2>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowStageManager(true)}
              className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
            >
              <Settings size={13} /> Gerenciar etapas
            </button>
          )}
        </div>
        <StageTrack etapas={stages} etapaAtiva={etapaAtiva} onSelecionar={setEtapaAtiva} />
      </div>

      {feedback && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {feedback}
        </div>
      )}

      {/* Grid: briefing (principal) + sidebar (cliente / documentos / horas) */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-text-secondary" />
                <h2 className="text-[15px] font-medium text-text-primary">Briefing</h2>
              </div>
              {canManage && !editingBriefing && (
                <button
                  type="button"
                  onClick={() => setEditingBriefing(true)}
                  className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  <Pencil size={13} /> {project?.briefing ? 'Editar' : 'Adicionar'}
                </button>
              )}
            </div>
            {editingBriefing ? (
              <div>
                <textarea
                  value={briefingDraft}
                  onChange={(e) => setBriefingDraft(e.target.value)}
                  rows={6}
                  placeholder="Escopo, objetivos, observações do projeto…"
                  className="w-full form-control border px-3 py-2 text-sm outline-none transition-colors resize-y"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button onClick={saveBriefing} disabled={briefingBusy}>
                    <Save size={15} /> {briefingBusy ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setEditingBriefing(false); setBriefingDraft(project?.briefing || '') }}
                    disabled={briefingBusy}
                  >
                    <X size={15} /> Cancelar
                  </Button>
                </div>
              </div>
            ) : project?.briefing ? (
              <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{project.briefing}</p>
            ) : (
              <p className="text-sm text-text-secondary/70 italic">Nenhum briefing ainda.</p>
            )}
          </Card>

          {/* Tarefas do projeto — board de 4 colunas */}
          <Card padded={false} className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="sm:pt-1">
                <h2 className="text-[15px] font-medium text-text-primary">
                  {boardTitle} · {filteredTasks?.length || 0}
                </h2>
                {etapaAtiva && (
                  <button
                    type="button"
                    onClick={() => setEtapaAtiva(null)}
                    className="mt-0.5 text-[11px] text-accent hover:underline"
                  >
                    Todas as etapas
                  </button>
                )}
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <Select
                  label="Responsável"
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="w-40"
                >
                  <option value="">Todos</option>
                  <option value="me">Só minhas</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                <Input
                  label="Buscar"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Título da tarefa..."
                  className="w-48"
                />
                {canCreate && (
                  <Button onClick={() => onNewTask(etapaAtiva)}>
                    <Plus size={16} /> Nova
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
            ) : (
              <KanbanBoard
                tasks={filteredTasks}
                onOpenTask={onOpenTask}
                onMove={onMove}
                currentUserId={currentUserId}
                timerElapsed={taskTimerElapsed}
                timerBusyId={timerBusyId}
                onToggleTimer={onToggleTimer}
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Cliente / endereço — cabeçalho continua com o principal
              (project.client, já sincronizado pelo backend); aqui o card
              lista TODOS os contratantes com o papel (item 7 do PDF: "ambos
              aparecem no projeto e o projeto aparece na ficha dos dois"). O
              contato mostrado continua sendo o do principal. */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <User size={16} className="text-text-secondary" />
              <h2 className="text-[15px] font-medium text-text-primary">Contratantes</h2>
            </div>
            {clients.length > 0 ? (
              <ul className="space-y-1.5">
                {clients.map((c) => (
                  <li key={c.client_id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-text-primary truncate">{c.name}</span>
                    <span className="flex-none text-[11px] text-text-secondary">
                      {papelClienteLabel(c.role)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-medium text-text-primary">{project?.client || '—'}</p>
            )}
            {project?.client_phone && (
              <p className="flex items-center gap-1.5 text-sm text-text-secondary mt-1.5">
                <Phone size={13} /> {project.client_phone}
              </p>
            )}
            {(project?.address || project?.client_address) && (
              <p className="flex items-start gap-1.5 text-sm text-text-secondary mt-1.5">
                <MapPin size={13} className="mt-0.5 flex-none" /> {project.address || project.client_address}
              </p>
            )}
          </Card>

          {/* Documentos */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-medium text-text-primary">Documentos</h2>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={docBusy}
                className="inline-flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <Upload size={13} /> {docBusy ? 'Enviando...' : 'Anexar'}
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleUploadDoc} />
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-text-secondary/70">Nenhum documento anexado.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 group">
                    <FileText size={14} className="text-text-secondary flex-none" />
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-text-primary truncate hover:text-accent transition-colors flex-1 min-w-0"
                      title={doc.file_name}
                    >
                      {doc.file_name}
                    </a>
                    <span className="text-[11px] text-text-secondary/70 flex-none">{formatFileSize(doc.file_size)}</span>
                    {(doc.uploaded_by === currentUserId || canManage) && (
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc)}
                        title="Excluir"
                        className="text-text-secondary/50 hover:text-state-danger opacity-0 group-hover:opacity-100 transition-opacity flex-none"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Horas */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Clock3 size={16} className="text-text-secondary" />
              <h2 className="text-[15px] font-medium text-text-primary">Horas</h2>
            </div>
            <p className="font-display text-2xl text-text-primary tabular-nums">{formatMinutes(hours.month_minutes)}</p>
            <p className="text-xs text-text-secondary mt-0.5">minhas · este mês</p>

            {showTimer && (
              <div className="mt-3 flex items-center gap-2 border-t border-border-subtle/60 pt-3">
                {isTiming ? (
                  <>
                    <span className={`flex-1 text-sm font-medium tabular-nums ${isPaused ? 'state-attention' : 'state-success'}`}>
                      {formatClock(entryElapsed)}
                      <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider">
                        {isPaused ? 'pausado' : 'em andamento'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => (isPaused ? onResumeEntry : onPauseEntry)?.()}
                      disabled={entryBusy}
                      title={isPaused ? 'Retomar' : 'Pausar'}
                      className="inline-flex items-center justify-center w-9 h-9 shrink-0 state-attention-soft hover:opacity-80 disabled:opacity-50 transition-colors"
                    >
                      {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onStopEntry?.()}
                      disabled={entryBusy}
                      title="Encerrar"
                      className="inline-flex items-center justify-center w-9 h-9 shrink-0 state-danger-soft hover:opacity-80 disabled:opacity-50 transition-colors"
                    >
                      <Square size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartEntry?.(project)}
                    disabled={entryBusy}
                    className="inline-flex items-center justify-center gap-2 w-full h-9 text-white bg-[color:var(--color-accent)] hover:opacity-90 disabled:opacity-50 text-sm font-medium transition-opacity"
                  >
                    <Play size={16} /> Apontar horas
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {showStageManager && (
        <StageManagerModal
          projectId={project.id}
          stages={stages}
          users={users}
          onClose={() => setShowStageManager(false)}
          onChanged={loadStages}
        />
      )}
    </div>
  )
}
