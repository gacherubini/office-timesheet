import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { formatMinutes, PRIORITIES } from './helpers'
import { CommentThread } from './CommentThread'
import { TaskLabels } from './TaskLabels'
import { TaskAttachments } from './TaskAttachments'
import { TaskActivity } from './TaskActivity'

export function TaskModal({
  task, projectId, users, canManage, currentUserId, isAdmin, onClose, onSaved, onDeleted, onChanged,
}) {
  const isNew = !task
  const [tab, setTab] = useState('details')
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || '')
  const [dueDate, setDueDate] = useState(task?.due_date || '')
  const [priority, setPriority] = useState(task?.priority || 'medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [timeData, setTimeData] = useState(null)
  const [timeBusy, setTimeBusy] = useState(false)

  const canViewActivity = !isNew && (task.created_by === currentUserId || isAdmin)

  async function loadTime() {
    if (isNew) return
    try {
      setTimeData(await api.get(`/tasks/${task.id}/time`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadTime()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!title.trim()) { setError('Informe um título.'); return }
    setSaving(true); setError('')
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        priority,
      }
      const saved = isNew
        ? await api.post(`/projects/${projectId}/tasks`, body)
        : await api.put(`/tasks/${task.id}`, body)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir esta tarefa?')) return
    setSaving(true)
    try {
      await api.delete(`/tasks/${task.id}`)
      onDeleted(task.id)
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  async function toggleTimer() {
    if (isNew) return
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

  function TabButton({ id, children }) {
    return (
      <button
        onClick={() => setTab(id)}
        className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
          tab === id ? 'bg-surface-alt text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        {children}
      </button>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Nova tarefa' : 'Detalhe da tarefa'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          {canManage && tab === 'details' && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
        </>
      }
    >
      {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}

      {!isNew && (
        <div className="flex items-center gap-1 mb-4 border-b border-border-subtle pb-3">
          <TabButton id="details">Detalhes</TabButton>
          <TabButton id="comments">Comentários</TabButton>
          {canViewActivity && <TabButton id="activity">Atividade</TabButton>}
        </div>
      )}

      {tab === 'details' && (
        <div className="space-y-3">
          <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} />
          <Input label="Descrição" as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Responsável" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!canManage}>
              <option value="">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canManage}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </div>
          <Input label="Prazo" type="date" value={dueDate || ''} onChange={(e) => setDueDate(e.target.value)} disabled={!canManage} />

          {!isNew && (
            <>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Etiquetas</p>
                <TaskLabels taskId={task.id} labels={task.labels} canManage={canManage} onChanged={onChanged} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Anexos</p>
                <TaskAttachments taskId={task.id} currentUserId={currentUserId} isAdmin={isAdmin} onChanged={onChanged} />
              </div>

              <div className="border-t border-border-subtle pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-text-secondary">Tempo na tarefa</span>
                  <span className="text-sm text-text-primary tabular-nums">{formatMinutes(timeData?.total_minutes || 0)}</span>
                </div>
                <button
                  onClick={toggleTimer} disabled={timeBusy}
                  className={`w-full text-sm px-3 py-2 rounded-lg font-medium disabled:opacity-60 transition-colors ${
                    timeData?.open_session ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-600'
                  }`}
                >
                  {timeBusy ? '...' : timeData?.open_session ? 'Parar cronômetro' : 'Iniciar cronômetro'}
                </button>
                {timeData?.per_user?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {timeData.per_user.map((u) => (
                      <div key={u.user_id} className="flex items-center justify-between text-[11px] text-text-secondary">
                        <span className="truncate">{u.user_name}</span>
                        <span className="tabular-nums">{formatMinutes(u.minutes)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canManage && (
                <button onClick={handleDelete} disabled={saving} className="text-xs text-rose-500 hover:underline">
                  Excluir tarefa
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'comments' && !isNew && (
        <CommentThread
          taskId={task.id}
          users={users}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onChanged={onChanged}
        />
      )}

      {tab === 'activity' && canViewActivity && <TaskActivity taskId={task.id} />}
    </Modal>
  )
}
