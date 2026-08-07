import { useState } from 'react'
import { ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const PRIORITIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]

// Gestão de templates de projeto: lista + editor. O editor salva a lista
// inteira de tasks de uma vez (POST cria / PUT substitui os itens).
export function TemplateManager({ templates, onBack, onChanged }) {
  const [editing, setEditing] = useState(null) // null | { id?, name, description, items: [] }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [success, setSuccess] = useState('')

  function startCreate() {
    setError('')
    setEditing({ name: '', description: '', items: [] })
  }

  async function startEdit(t) {
    setError('')
    try {
      const full = await api.get(`/project-templates/${t.id}`)
      setEditing({
        id: full.id,
        name: full.name || '',
        description: full.description || '',
        items: (full.items || []).map((i) => ({
          title: i.title,
          description: i.description || '',
          priority: i.priority,
        })),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  function updateItem(idx, patch) {
    setEditing((e) => ({ ...e, items: e.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))
  }
  function addItem() {
    setEditing((e) => ({ ...e, items: [...e.items, { title: '', description: '', priority: 'medium' }] }))
  }
  function removeItem(idx) {
    setEditing((e) => ({ ...e, items: e.items.filter((_, i) => i !== idx) }))
  }
  function moveItem(idx, dir) {
    setEditing((e) => {
      const j = idx + dir
      if (j < 0 || j >= e.items.length) return e
      const items = [...e.items]
      const tmp = items[idx]
      items[idx] = items[j]
      items[j] = tmp
      return { ...e, items }
    })
  }

  async function save() {
    if (!editing.name.trim()) { setError('Informe o nome do template.'); return }
    if (editing.items.some((i) => !i.title.trim())) { setError('Toda task precisa de um título.'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      items: editing.items.map((i) => ({
        title: i.title.trim(),
        description: i.description.trim() || null,
        priority: i.priority,
      })),
    }
    try {
      if (editing.id) await api.put(`/project-templates/${editing.id}`, payload)
      else await api.post('/project-templates', payload)
      const wasEditing = Boolean(editing.id)
      setEditing(null)
      onChanged?.()
      setSuccess(wasEditing ? 'Template atualizado!' : 'Template criado!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    setDeleting(true)
    try {
      await api.delete(`/project-templates/${toDelete.id}`)
      setToDelete(null)
      onChanged?.()
      setSuccess('Template excluído!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} />
        Voltar aos projetos
      </button>

      <PageHeader
        title="Templates de Projeto"
        subtitle="Conjuntos de tarefas reutilizáveis ao criar um projeto"
        actions={
          <Button onClick={startCreate}>
            <Plus size={16} />
            Novo template
          </Button>
        }
      />

      {error && !editing && (
        <div className="mb-4 state-danger-soft text-sm p-3">{error}</div>
      )}

      {templates.length === 0 ? (
        <div className="border border-dashed border-border-subtle py-16 text-center text-sm text-text-secondary">
          Nenhum template ainda. Crie um para gerar tarefas automaticamente em novos projetos.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-text-primary">{t.name}</h3>
                  <p className="text-xs text-text-secondary">{t.item_count} task(s)</p>
                </div>
              </div>
              {t.description && <p className="text-xs text-text-secondary line-clamp-2">{t.description}</p>}
              <div className="mt-1 flex items-center gap-3 border-t border-border-subtle/60 pt-2">
                <button
                  type="button"
                  onClick={() => startEdit(t)}
                  className="inline-flex items-center gap-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setToDelete(t)}
                  className="inline-flex items-center gap-1 text-[11px] state-danger transition-colors hover:opacity-75"
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor de template */}
      <Modal
        open={Boolean(editing)}
        onClose={() => (saving ? null : setEditing(null))}
        title={editing?.id ? 'Editar template' : 'Novo template'}
        size="lg"
      >
        {editing && (
          <div className="space-y-3">
            {error && (
              <div className="state-danger-soft text-sm p-3">{error}</div>
            )}
            <Input
              label="Nome do template"
              required
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Input
              label="Descrição"
              as="textarea"
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Opcional"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-text-secondary">Tasks do template</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Plus size={12} /> Adicionar task
                </button>
              </div>

              {editing.items.length === 0 ? (
                <p className="text-xs text-text-secondary">Nenhuma task. Adicione ao menos uma.</p>
              ) : (
                <div className="space-y-2">
                  {editing.items.map((item, idx) => (
                    <div key={idx} className="border border-border-subtle p-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col pt-1">
                          <button
                            type="button"
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0}
                            className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                            title="Subir"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === editing.items.length - 1}
                            className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                            title="Descer"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex gap-2">
                            <input
                              value={item.title}
                              onChange={(e) => updateItem(idx, { title: e.target.value })}
                              placeholder="Título da task"
                              className="flex-1 form-control border px-3 py-2 text-sm outline-none transition-colors"
                            />
                            <Select
                              value={item.priority}
                              onChange={(e) => updateItem(idx, { priority: e.target.value })}
                              className="w-36 flex-shrink-0"
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </Select>
                          </div>
                          <textarea
                            value={item.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Descrição (opcional)"
                            rows={2}
                            className="w-full form-control border px-3 py-2 text-sm outline-none transition-colors resize-y"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-text-secondary hover:text-[color:var(--state-danger)] pt-1"
                          title="Remover task"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar template'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmar exclusão */}
      <Modal
        open={Boolean(toDelete)}
        onClose={() => (deleting ? null : setToDelete(null))}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="danger" onClick={doDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="state-danger-soft p-4 mb-4">
            <AlertTriangle className="state-danger" size={32} />
          </div>
          <p className="text-text-primary">
            Excluir o template <span className="font-medium">{toDelete?.name}</span>? Projetos já criados a partir dele não são afetados.
          </p>
        </div>
      </Modal>

      {/* Sucesso */}
      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess('')}
        size="sm"
        footer={<Button onClick={() => setSuccess('')}>OK</Button>}
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="state-success-soft p-4 mb-4">
            <CheckCircle2 className="state-success" size={32} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </>
  )
}
