import { useState, useEffect, useRef } from 'react'
import { Lock, Paperclip, UploadCloud } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { DateField } from './ui/DateField'
import { Button } from './ui/Button'
import { ClientAttachments } from './ClientAttachments'
import { useDropzone } from '../hooks/useDropzone'
import { useCep } from '../hooks/useCep'
import { PendingChip } from '../pages/projectBoard/AttachmentChip'
import { ContactListField } from './pessoas/ContactListField'
import { AddressListField } from './pessoas/AddressListField'
import { PersonTypeToggle } from './pessoas/PersonTypeToggle'
import { PersonLinksField } from './pessoas/PersonLinksField'
import { BankFields } from './pessoas/BankFields'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Estado do formulário unificado PF/PJ (item 3 do PDF de ajustes de
// 18/08/2026), com contatos múltiplos (item 2), CEP (item 1) e dados
// bancários (item 6). Os campos do "outro" tipo continuam no estado mesmo
// quando não exibidos — ver PersonTypeToggle.jsx.
const EMPTY_CLIENT_FORM = {
  person_type: 'pf',
  name: '',
  cpf: '',
  rg: '',
  birth_date: '',
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  founded_date: '',
  bank_name: '',
  bank_agency: '',
  bank_account: '',
  bank_account_type: '',
  pix_key: '',
  notes: '',
  admin_only: false,
  phones: [],
  emails: [],
  addresses: [],
  links: [],
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

// Cadastro de cliente in-page (portado da antiga página "Clientes"), agora
// PF/PJ com contatos múltiplos, CEP e vínculos (item 1, 2, 3 e 6 do PDF de
// 18/08/2026). Mantém os mesmos endpoints e a UI de anexos ao editar.
export function ClientFormModal({ open, client, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingFicha, setLoadingFicha] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const editing = Boolean(client)
  const { erro: erroCep, buscar: buscarCep } = useCep()

  useEffect(() => {
    if (!open) return
    setPendingFiles([])
    setError('')

    if (!client) {
      setForm(EMPTY_CLIENT_FORM)
      return
    }

    // A listagem só traz os contatos principais; a ficha completa (com as
    // listas inteiras) precisa do GET por id.
    let cancelado = false
    setLoadingFicha(true)
    api
      .get(`/admin/clients/${client.id}`)
      .then((ficha) => {
        if (cancelado) return
        setForm({
          person_type: ficha.person_type || 'pf',
          name: ficha.name || '',
          cpf: ficha.cpf || '',
          rg: ficha.rg || '',
          birth_date: ficha.birth_date || '',
          razao_social: ficha.razao_social || '',
          nome_fantasia: ficha.nome_fantasia || '',
          cnpj: ficha.cnpj || '',
          inscricao_estadual: ficha.inscricao_estadual || '',
          founded_date: ficha.founded_date || '',
          bank_name: ficha.bank_name || '',
          bank_agency: ficha.bank_agency || '',
          bank_account: ficha.bank_account || '',
          bank_account_type: ficha.bank_account_type || '',
          pix_key: ficha.pix_key || '',
          notes: ficha.notes || '',
          admin_only: Boolean(ficha.admin_only),
          phones: ficha.phones || [],
          emails: ficha.emails || [],
          addresses: ficha.addresses || [],
          links: ficha.links || [],
        })
      })
      .catch((err) => {
        if (!cancelado) setError(err.message)
      })
      .finally(() => {
        if (!cancelado) setLoadingFicha(false)
      })
    return () => {
      cancelado = true
    }
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

  const isPj = form.person_type === 'pj'

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      closeOnBackdrop={false}
      size="lg"
      title={editing ? 'Editar Cliente' : 'Novo Cliente'}
    >
      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">{error}</div>
      )}
      {loadingFicha ? (
        <p className="text-center py-8 text-text-secondary text-sm">Carregando ficha...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <PersonTypeToggle
            valor={form.person_type}
            onChange={(person_type) => setForm({ ...form, person_type })}
          />

          {isPj ? (
            <>
              <Input
                label="Razão social"
                required
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
              />
              <Input
                label="Nome fantasia"
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
                <Input
                  label="Inscrição estadual"
                  value={form.inscricao_estadual}
                  onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                />
              </div>
              <DateField
                label="Data de fundação"
                value={form.founded_date}
                onChange={(e) => setForm({ ...form, founded_date: e.target.value })}
                showYearDropdown
                showMonthDropdown
              />
            </>
          ) : (
            <>
              <Input
                label="Nome"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="CPF"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
                <Input
                  label="RG"
                  value={form.rg}
                  onChange={(e) => setForm({ ...form, rg: e.target.value })}
                />
              </div>
              <DateField
                label="Data de nascimento"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                showYearDropdown
                showMonthDropdown
              />
            </>
          )}

          <ContactListField
            tipo="phone"
            itens={form.phones}
            onChange={(phones) => setForm({ ...form, phones })}
          />
          <ContactListField
            tipo="email"
            itens={form.emails}
            onChange={(emails) => setForm({ ...form, emails })}
          />
          <AddressListField
            itens={form.addresses}
            onChange={(addresses) => setForm({ ...form, addresses })}
            buscar={buscarCep}
            erroCep={erroCep}
          />

          <BankFields
            valor={form}
            onChange={(bancarios) => setForm({ ...form, ...bancarios })}
          />

          {isPj && (
            <PersonLinksField
              entity="cliente"
              itens={form.links}
              onChange={(links) => setForm({ ...form, links })}
              excludeId={client?.id}
            />
          )}

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
      )}
    </Modal>
  )
}
