import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { AlertTriangle, CheckCircle2, MessageCircle, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
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
  const { canAccessAdminArea } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [supplierToDelete, setSupplierToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

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
      const wasEditing = Boolean(editingSupplier)
      if (wasEditing) {
        await api.put(`/admin/suppliers/${editingSupplier.id}`, form)
      } else {
        await api.post('/admin/suppliers', form)
      }
      resetForm()
      loadSuppliers()
      setSuccessMessage(wasEditing ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor cadastrado com sucesso!')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!supplierToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/suppliers/${supplierToDelete.id}`)
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== supplierToDelete.id))
      setSupplierToDelete(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
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
                      {canAccessAdminArea && (
                        <button
                          onClick={() => {
                            setSupplierToDelete(supplier)
                            setDeleteError('')
                          }}
                          className="text-sm text-rose-500 hover:text-rose-400 transition-colors"
                        >
                          Excluir
                        </button>
                      )}
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

      <Modal
        open={Boolean(supplierToDelete)}
        onClose={() => {
          setSupplierToDelete(null)
          setDeleteError('')
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setSupplierToDelete(null)
                setDeleteError('')
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="bg-rose-500/15 rounded-full p-4 mb-4">
            <AlertTriangle className="text-rose-500" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">
            Excluir fornecedor?
          </h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{supplierToDelete?.name}</strong>
          </p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Esta ação remove o cadastro.
          </p>
          <p className="text-text-secondary">
            Confira se este fornecedor não será mais necessário antes de continuar.
          </p>
        </div>
        {deleteError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mt-3">
            {deleteError}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(successMessage)}
        onClose={() => setSuccessMessage('')}
        size="sm"
        footer={
          <Button onClick={() => setSuccessMessage('')}>OK</Button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>
    </div>
  )
}
