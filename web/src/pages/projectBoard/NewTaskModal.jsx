import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
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

// `projects` (opcional) habilita o seletor de projeto (usado no board global de
// Tarefas). No board de um projeto, passe `projectId` e omita `projects`.
// `etapaAtiva` (opcional) pré-preenche a etapa quando a tarefa nasce a partir
// de uma trilha já filtrada — quem está olhando o Anteprojeto quase sempre
// quer criar tarefa nele (item 8 do PDF).
export function NewTaskModal({ projectId, projects, users, etapaAtiva, onClose, onCreated }) {
  const showProjectPicker = Array.isArray(projects) && projects.length > 0 && !projectId
  const [selectedProject, setSelectedProject] = useState(projectId || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [stageId, setStageId] = useState(etapaAtiva || '')
  const [stages, setStages] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Etapa é obrigatória — a lista vem do projeto selecionado (Task 7 do
  // backend). Recarrega sempre que o projeto muda (relevante no seletor do
  // board global de Tarefas, onde o usuário escolhe o projeto na hora).
  useEffect(() => {
    if (!selectedProject) { setStages([]); return }
    let cancelado = false
    api.get(`/projects/${selectedProject}/stages`)
      .then((rows) => { if (!cancelado) setStages(rows || []) })
      .catch(() => { if (!cancelado) setStages([]) })
    return () => { cancelado = true }
  }, [selectedProject])

  // Pré-preenche com a etapa filtrada assim que a lista chega, sem sobrescrever
  // uma escolha que o usuário já tenha feito na mesma sessão do modal.
  useEffect(() => {
    if (etapaAtiva && stages.some((e) => e.id === etapaAtiva)) {
      setStageId((cur) => cur || etapaAtiva)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages])

  async function handleCreate() {
    if (!title.trim()) { setError('Informe um título.'); return }
    if (!selectedProject) { setError('Selecione um projeto.'); return }
    if (!stageId) { setError('Selecione a etapa da tarefa.'); return }
    setSaving(true); setError('')
    try {
      const created = await api.post(`/projects/${selectedProject}/tasks`, {
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        priority,
        stage_id: stageId,
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
      size="lg"
      overflowVisible
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
      {error && <p className="text-xs state-danger mb-3">{error}</p>}
      <div className="space-y-4">
        {showProjectPicker && (
          <Select
            label="Projeto"
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setStageId('') }}
          >
            <option value="">Selecione um projeto...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
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
        <Select label="Etapa" required value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">
            {selectedProject ? 'Selecione a etapa...' : 'Selecione um projeto primeiro'}
          </option>
          {stages.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <Input label="Descrição" as="textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  )
}
