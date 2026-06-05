import { useState, useEffect } from 'react'
import { Archive, RotateCcw, Trash2, Play, Square, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'
import { uploadAttachment } from '../../lib/taskAttachments'
import { useDropzone } from '../../hooks/useDropzone'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/Avatar'
import { formatMinutes, ABANDONED_STATUS } from './helpers'
import { StatusChip } from './StatusChip'
import { AssigneePicker } from './AssigneePicker'
import { PriorityChip } from './PriorityChip'
import { DueDateChip } from './DueDateChip'
import { DescriptionAttachments } from './DescriptionAttachments'
import { CommentThread } from './CommentThread'
import { ActivityPopover } from './ActivityPopover'

export function TaskDetailContent({
  task: initialTask, users, canManage, currentUserId, isAdmin, onChanged, onDeleted,
}) {
  const [task, setTask] = useState(initialTask)
  const [title, setTitle] = useState(initialTask.title)
  const [description, setDescription] = useState(initialTask.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [timeData, setTimeData] = useState(null)
  const [timeBusy, setTimeBusy] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [confirmingAbandon, setConfirmingAbandon] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [descUploading, setDescUploading] = useState(false)
  const [descAttKey, setDescAttKey] = useState(0)
  const [commentCount, setCommentCount] = useState(initialTask.comment_count || 0)

  useEffect(() => {
    setTask(initialTask)
    setTitle(initialTask.title)
    setDescription(initialTask.description || '')
  }, [initialTask])

  const dirty = title !== task.title || (description || '') !== (task.description || '')
  // Mover de coluna é liberado a qualquer usuário logado (edição segue restrita).
  const canMoveStatus = true

  async function loadTime() {
    try {
      setTimeData(await api.get(`/tasks/${task.id}/time`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadTime()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  // Autosave para campos "chip" (1 click → 1 valor).
  async function patch(body, optimistic) {
    setError('')
    const prev = task
    if (optimistic) setTask({ ...task, ...optimistic })
    try {
      const updated = await api.put(`/tasks/${task.id}`, body)
      setTask((cur) => ({ ...cur, ...updated }))
      onChanged?.()
    } catch (err) {
      setTask(prev)
      setError(err.message)
    }
  }

  async function changeStatus(status) {
    setError('')
    const prev = task
    setTask({ ...task, status })
    try {
      const updated = await api.put(`/tasks/${task.id}/status`, { status, position: 0 })
      setTask((cur) => ({ ...cur, ...updated }))
      onChanged?.()
    } catch (err) {
      setTask(prev)
      setError(err.message)
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('Informe um título.'); return }
    setSaving(true); setError('')
    try {
      const updated = await api.put(`/tasks/${task.id}`, {
        title: title.trim(),
        description: description.trim() || null,
      })
      setTask((cur) => ({ ...cur, ...updated }))
      setSuccessMessage('Tarefa salva com sucesso!')
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Abandonar = mover pro status terminal "abandoned" (não apaga). Fechamos
  // o modal e recarregamos: o card sai do quadro ativo pra seção Abandonados.
  async function handleAbandon() {
    setSaving(true)
    try {
      await api.put(`/tasks/${task.id}/status`, { status: ABANDONED_STATUS, position: 0 })
      onDeleted?.(task.id)
    } catch (err) {
      setError(err.message); setSaving(false); setConfirmingAbandon(false)
    }
  }

  // Reabrir = tira de "abandoned" e devolve pra "A fazer".
  async function handleReopen() {
    setSaving(true)
    try {
      await api.put(`/tasks/${task.id}/status`, { status: 'todo', position: 0 })
      onDeleted?.(task.id)
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  // Exclusão definitiva: só pra tarefa já abandonada. Apaga de vez (irreversível).
  async function handleDelete() {
    setSaving(true)
    try {
      await api.delete(`/tasks/${task.id}`)
      onDeleted?.(task.id)
    } catch (err) {
      setError(err.message); setSaving(false); setConfirmingDelete(false)
    }
  }

  async function uploadDescriptionFiles(files) {
    if (!files || files.length === 0) return
    setDescUploading(true); setError('')
    try {
      for (const file of files) {
        await uploadAttachment(task.id, file)
      }
      setDescAttKey((k) => k + 1)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setDescUploading(false)
    }
  }

  const { dragOver: descDragOver, dropProps: descDropProps } = useDropzone(uploadDescriptionFiles)

  async function toggleTimer() {
    setTimeBusy(true)
    try {
      const open = timeData?.open_session
      await api.post(`/tasks/${task.id}/time/${open ? 'stop' : 'start'}`, {})
      await loadTime()
    } catch (err) {
      setError(err.message)
    } finally {
      setTimeBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Erro */}
      {error && (
        <div className="mx-6 mt-4 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-500 text-xs">{error}</div>
      )}

      {/* Header: contexto */}
      <div className="px-6 pt-5 pb-2">
        <p className="text-[11px] uppercase tracking-wider text-text-secondary">{task.project_name}</p>
      </div>

      {/* Titulo (editavel) */}
      <div className="px-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canManage}
          placeholder="Título da tarefa"
          className="w-full bg-transparent text-2xl font-display text-text-primary outline-none border-b border-transparent focus:border-border-subtle py-1 disabled:opacity-80"
        />
      </div>

      {/* Chips */}
      <div className="px-6 mt-4 flex flex-wrap items-center gap-2">
        <StatusChip
          value={task.status}
          onChange={changeStatus}
          disabled={!canMoveStatus}
        />
        <AssigneePicker
          users={users}
          value={task.assignee_id}
          onChange={(id) => patch({ assignee_id: id }, { assignee_id: id })}
          disabled={!canManage}
        />
        <PriorityChip
          value={task.priority}
          onChange={(p) => patch({ priority: p }, { priority: p })}
          disabled={!canManage}
        />
        <DueDateChip
          value={task.due_date}
          status={task.status}
          onChange={(d) => patch({ due_date: d }, { due_date: d })}
          disabled={!canManage}
        />
        <div className="ml-auto">
          <ActivityPopover taskId={task.id} />
        </div>
      </div>

      {/* Corpo: coluna unica em largura cheia */}
      <div className="flex-1 px-6 mt-5 pb-24 overflow-y-auto space-y-6">
        <section>
          <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">Descrição</p>
          <div className="relative" {...descDropProps}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canManage}
              rows={5}
              placeholder={canManage ? 'Adicione mais detalhes... (arraste arquivos pra anexar)' : 'Sem descrição.'}
              className="w-full form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors resize-y disabled:opacity-70"
            />
            {descDragOver && (
              <div className="absolute inset-0 rounded-lg border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center pointer-events-none">
                <span className="text-xs font-medium text-accent">Solte para anexar</span>
              </div>
            )}
          </div>
          <DescriptionAttachments
            taskId={task.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            uploading={descUploading}
            onChanged={onChanged}
            refreshKey={descAttKey}
          />
        </section>

        <section>
          <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">
            Comentários {commentCount > 0 && <span className="text-text-secondary normal-case">({commentCount})</span>}
          </p>
          <CommentThread
            taskId={task.id}
            users={users}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChanged={onChanged}
            onCountChange={setCommentCount}
          />
        </section>

        {/* Cronometro na base */}
        <section className="rounded-lg border border-border-subtle bg-surface-alt/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-text-secondary">Cronômetro</span>
            <span className="text-sm text-text-primary tabular-nums">{formatMinutes(timeData?.total_minutes || 0)} total</span>
          </div>
          <button
            type="button"
            onClick={toggleTimer}
            disabled={timeBusy}
            className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-60 transition-colors ${
              timeData?.open_session ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-600'
            }`}
          >
            {timeData?.open_session ? <Square size={13} /> : <Play size={13} />}
            {timeBusy ? '...' : timeData?.open_session ? 'Parar cronômetro' : 'Iniciar cronômetro'}
          </button>
          {timeData?.per_user?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-subtle grid grid-cols-2 sm:grid-cols-3 gap-2">
              {timeData.per_user.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Avatar name={u.user_name} url={u.user_avatar_url} size={16} />
                    <span className="text-text-secondary truncate">{u.user_name}</span>
                  </div>
                  <span className="text-text-secondary tabular-nums flex-shrink-0">{formatMinutes(u.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Rodape sticky. Abandonar/reabrir: qualquer usuário. Excluir: admin/líder. */}
      <div className="absolute bottom-0 left-0 right-0 bg-surface-alt border-t border-border-subtle px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {task.status === ABANDONED_STATUS ? (
            <>
              <button
                type="button"
                onClick={handleReopen}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-60"
              >
                <RotateCcw size={13} /> Reabrir tarefa
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-600 disabled:opacity-60"
                >
                  <Trash2 size={13} /> Excluir definitivamente
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingAbandon(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-rose-500 disabled:opacity-60"
            >
              <Archive size={13} /> Abandonar tarefa
            </button>
          )}
        </div>
        {canManage && (
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Salvando...' : dirty ? 'Salvar' : 'Salvo'}
          </Button>
        )}
      </div>

      <Modal
        open={confirmingAbandon}
        onClose={() => (saving ? null : setConfirmingAbandon(false))}
        title="Abandonar tarefa"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingAbandon(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleAbandon} disabled={saving}>
              {saving ? 'Abandonando...' : 'Abandonar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-primary">
          Mover <span className="font-semibold">{task.title}</span> para os abandonados? Ela sai do quadro ativo, mas
          não é apagada — você pode reabri-la quando quiser.
        </p>
      </Modal>

      <Modal
        open={confirmingDelete}
        onClose={() => (saving ? null : setConfirmingDelete(false))}
        title="Excluir definitivamente"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo...' : 'Excluir definitivamente'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-primary">
          Apagar <span className="font-semibold">{task.title}</span> de vez? Esta ação <span className="font-semibold">não pode ser desfeita</span> —
          comentários, anexos e tempo registrado serão removidos.
        </p>
      </Modal>

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
    </div>
  )
}
