import { useState } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { AssigneePicker } from './AssigneePicker'
import { PriorityChip } from './PriorityChip'
import { DueDateChip } from './DueDateChip'

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-1.5">{label}</p>
      {children}
    </div>
  )
}

export function NewTaskModal({ projectId, users, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!title.trim()) { setError('Informe um título.'); return }
    setSaving(true); setError('')
    try {
      const created = await api.post(`/projects/${projectId}/tasks`, {
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        priority,
      })
      onCreated(created)
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Nova tarefa"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Criando...' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}
      <div className="space-y-3">
        <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Input label="Descrição" as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex flex-wrap gap-4">
          <Field label="Responsável">
            <AssigneePicker users={users} value={assigneeId || null} onChange={(id) => setAssigneeId(id || '')} />
          </Field>
          <Field label="Prioridade">
            <PriorityChip value={priority} onChange={setPriority} />
          </Field>
          <Field label="Prazo">
            <DueDateChip value={dueDate || null} status="todo" onChange={(d) => setDueDate(d || '')} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
