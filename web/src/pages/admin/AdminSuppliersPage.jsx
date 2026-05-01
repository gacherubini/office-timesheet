import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { MessageCircle, Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const emptyForm = {
  name: '',
  category: '',
  email: '',
  phone: '',
  notes: '',
}

function whatsappLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

export function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [form, setForm] = useState(emptyForm)

  async function loadSuppliers() {
    setPageError('')
    try {
      const data = await api.get('/admin/suppliers')
      setSuppliers(data)
    } catch (err) {
      setPageError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingSupplier(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(supplier) {
    setForm({
      name: supplier.name || '',
      category: supplier.category || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      notes: supplier.notes || '',
    })
    setEditingSupplier(supplier)
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      if (editingSupplier) {
        await api.put(`/admin/suppliers/${editingSupplier.id}`, form)
      } else {
        await api.post('/admin/suppliers', form)
      }
      resetForm()
      loadSuppliers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(supplier) {
    if (!confirm(`Excluir o fornecedor "${supplier.name}"?`)) return

    try {
      await api.delete(`/admin/suppliers/${supplier.id}`)
      loadSuppliers()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Cadastro de fornecedores"
        actions={
          <Button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            <Plus size={16} />
            Novo Fornecedor
          </Button>
        }
      />

      {pageError && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {pageError}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Nome
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Categoria
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                E-mail
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Telefone
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Observações
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-text-secondary">
                  Nenhum fornecedor cadastrado.
                </td>
              </tr>
            ) : (
              suppliers.map((supplier) => {
                const wa = whatsappLink(supplier.phone)
                return (
                  <tr
                    key={supplier.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{supplier.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{supplier.category || '-'}</td>
                    <td className="px-4 py-3 text-text-secondary">{supplier.email || '-'}</td>
                    <td className="px-4 py-3">
                      {supplier.phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-text-secondary">{supplier.phone}</span>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir WhatsApp"
                              className="text-emerald-500 hover:text-emerald-400 p-1 rounded hover:bg-emerald-500/10 transition-colors"
                            >
                              <MessageCircle size={16} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary max-w-md whitespace-pre-wrap">
                      {supplier.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => startEdit(supplier)}
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(supplier)}
                        className="text-sm text-rose-500 hover:text-rose-400 transition-colors"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
      >
        {error && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
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
          <Button type="submit" className="w-full">
            {editingSupplier ? 'Salvar' : 'Criar Fornecedor'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
