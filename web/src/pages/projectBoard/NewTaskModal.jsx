import { useState } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { PRIORITIES } from './helpers'

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
        <div className="grid grid-cols-2 gap-3">
          <Select label="Responsável" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Sem responsável</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        </div>
        <Input label="Prazo" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
    </Modal>
  )
}
