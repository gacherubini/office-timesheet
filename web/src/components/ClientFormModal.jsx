import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { DateField } from './ui/DateField'
import { Button } from './ui/Button'
import { ClientAttachments } from './ClientAttachments'

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

// Cadastro de cliente in-page (portado da antiga página "Clientes"). Mantém os
// mesmos campos, endpoints e payloads; inclui a UI de anexos ao editar.
export function ClientFormModal({ open, client, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
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
    setError('')
  }, [open, client])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/clients/${client.id}`, form)
      } else {
        await api.post('/admin/clients', form)
      }
      onSaved(editing ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!')
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
        <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mb-4">{error}</div>
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
        {editing && (
          <div className="rounded-lg border border-border-subtle p-3">
            <ClientAttachments clientId={client.id} />
          </div>
        )}
        {isAdmin && (
          <label className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3 cursor-pointer">
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
