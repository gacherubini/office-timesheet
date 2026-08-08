import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Button } from './ui/Button'

const EMPTY_SUPPLIER_FORM = {
  name: '',
  category: '',
  email: '',
  phone: '',
  notes: '',
  admin_only: false,
}

// Cadastro de fornecedor in-page (portado da antiga página "Fornecedores").
// Mantém os mesmos campos, endpoints e payloads. Fornecedores não têm anexos.
export function SupplierFormModal({ open, supplier, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(supplier)

  useEffect(() => {
    if (!open) return
    if (supplier) {
      setForm({
        name: supplier.name || '',
        category: supplier.category || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        notes: supplier.notes || '',
        admin_only: Boolean(supplier.admin_only),
      })
    } else {
      setForm(EMPTY_SUPPLIER_FORM)
    }
    setError('')
  }, [open, supplier])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/suppliers/${supplier.id}`, form)
      } else {
        await api.post('/admin/suppliers', form)
      }
      onSaved(editing ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor cadastrado com sucesso!')
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
      title={editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
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
          label="Categoria"
          placeholder="Ex: Software, Materiais, Serviços"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
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
        <Input
          label="Observações"
          as="textarea"
          rows={4}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
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
                Colaboradores não veem este fornecedor.
              </span>
            </span>
          </label>
        )}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving
            ? editing
              ? 'Salvando...'
              : 'Criando...'
            : editing
              ? 'Salvar'
              : 'Criar Fornecedor'}
        </Button>
      </form>
    </Modal>
  )
}
