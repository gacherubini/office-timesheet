import { useState, useEffect, useRef } from 'react'
import { Lock, Paperclip, UploadCloud } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { DateField } from './ui/DateField'
import { Button } from './ui/Button'
import { ClientAttachments } from './ClientAttachments'
import { useDropzone } from '../hooks/useDropzone'
import { PendingChip } from '../pages/projectBoard/AttachmentChip'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

const EMPTY_CLIENT_FORM = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  birth_date: '',
  address: '',
  notes: '',
  admin_only: false,
}

// Sobe os arquivos preparados na criação para o cliente recém-criado, usando o
// MESMO endpoint por-id do editar (não há upload na criação: o anexo precisa do
// id, que só existe depois do POST). Best-effort: devolve os nomes que falharam
// em vez de estourar — o cliente já foi criado, então uma falha de anexo não
// pode reverter nem barrar o cadastro.
async function uploadClientAttachments(clientId, files) {
  const falhas = []
  for (const file of files) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BASE_URL}/admin/clients/${clientId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        body: fd,
      })
      if (!res.ok) falhas.push(file.name)
    } catch {
      falhas.push(file.name)
    }
  }
  return falhas
}

// Campo de anexos na CRIAÇÃO: segura os arquivos em memória (ainda não há id) e
// mostra como chips pendentes; o upload real acontece no submit. Espelha o visual
// do ClientAttachments (dropzone + "Adicionar") para parecer a mesma coisa.
function PendingAttachmentsField({ files, onAdd, onRemove }) {
  const inputRef = useRef(null)
  const { dragOver, dropProps } = useDropzone(onAdd)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-text-secondary">Anexos</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Paperclip size={12} /> Adicionar
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = '' }}
      />
      <div
        {...dropProps}
        onClick={() => files.length === 0 && inputRef.current?.click()}
        className={`relative border border-dashed p-3 transition-colors ${
          dragOver ? 'border-accent bg-accent/10' : 'border-border-subtle'
        } ${files.length === 0 ? 'cursor-pointer' : ''}`}
      >
        {files.length === 0 ? (
          <p className={`flex items-center justify-center gap-1.5 text-xs text-text-secondary py-2 ${dragOver ? 'invisible' : ''}`}>
            <UploadCloud size={14} /> Arraste arquivos aqui ou clique para selecionar
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((f, i) => (
              <PendingChip key={`${f.name}-${i}`} file={f} onRemove={() => onRemove(i)} />
            ))}
          </div>
        )}
        {dragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-accent">Solte para anexar ao cliente</span>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-text-secondary">Os anexos serão enviados ao criar o cliente.</p>
    </div>
  )
}

// Cadastro de cliente in-page (portado da antiga página "Clientes"). Mantém os
// mesmos campos, endpoints e payloads; inclui a UI de anexos ao editar.
export function ClientFormModal({ open, client, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const editing = Boolean(client)

  useEffect(() => {
    if (!open) return
    if (client) {
      setForm({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        cpf: client.cpf || '',
        birth_date: client.birth_date || '',
        address: client.address || '',
        notes: client.notes || '',
        admin_only: Boolean(client.admin_only),
      })
    } else {
      setForm(EMPTY_CLIENT_FORM)
    }
    setPendingFiles([])
    setError('')
  }, [open, client])

  function addPending(files) {
    if (files?.length) setPendingFiles((prev) => [...prev, ...files])
  }
  function removePending(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/clients/${client.id}`, form)
        onSaved('Cliente atualizado com sucesso!')
      } else {
        // Cria o cliente e, com o id novo em mãos, sobe os anexos preparados.
        const created = await api.post('/admin/clients', form)
        let aviso = ''
        if (pendingFiles.length) {
          const falhas = await uploadClientAttachments(created.id, pendingFiles)
          if (falhas.length) aviso = ` Mas falhou o envio de ${falhas.length} anexo(s): ${falhas.join(', ')}.`
        }
        onSaved(`Cliente cadastrado com sucesso!${aviso}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      closeOnBackdrop={false}
      title={editing ? 'Editar Cliente' : 'Novo Cliente'}
    >
      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Nome"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="E-mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Telefone"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="CPF"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            placeholder="000.000.000-00"
          />
          <DateField
            label="Data de nascimento"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            showYearDropdown
            showMonthDropdown
          />
        </div>
        <Input
          label="Endereço"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Input
          label="Observações"
          as="textarea"
          rows={4}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <div className="border border-border-subtle p-3">
          {editing ? (
            <ClientAttachments clientId={client.id} />
          ) : (
            <PendingAttachmentsField files={pendingFiles} onAdd={addPending} onRemove={removePending} />
          )}
        </div>
        {isAdmin && (
          <label className="flex items-start gap-2.5 border border-border-subtle p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.admin_only}
              onChange={(e) => setForm({ ...form, admin_only: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                <Lock size={13} /> Visível só para admins
              </span>
              <span className="block text-xs text-text-secondary">
                Colaboradores não veem este cliente.
              </span>
            </span>
          </label>
        )}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? (editing ? 'Salvando...' : 'Criando...') : editing ? 'Salvar' : 'Criar Cliente'}
        </Button>
      </form>
    </Modal>
  )
}
