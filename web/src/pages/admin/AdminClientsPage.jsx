import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { AlertTriangle, CheckCircle2, MessageCircle, Plus, Lock, Paperclip } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { DateField } from '../../components/ui/DateField'
import { Button } from '../../components/ui/Button'
import { ClientAttachments } from './ClientAttachments'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  birth_date: '',
  address: '',
  notes: '',
  admin_only: false,
}

function whatsappLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

export function AdminClientsPage() {
  const { canDeleteClients, isAdmin } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [clientToDelete, setClientToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  async function loadClients() {
    setPageError('')
    try {
      const data = await api.get('/admin/clients')
      setClients(data)
    } catch (err) {
      setPageError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClients()
  }, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingClient(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(client) {
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
    setEditingClient(client)
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      const wasEditing = Boolean(editingClient)
      if (wasEditing) {
        await api.put(`/admin/clients/${editingClient.id}`, form)
      } else {
        await api.post('/admin/clients', form)
      }
      resetForm()
      loadClients()
      setSuccessMessage(wasEditing ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!clientToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/clients/${clientToDelete.id}`)
      setClients((prev) => prev.filter((client) => client.id !== clientToDelete.id))
      setClientToDelete(null)
      setSuccessMessage('Cliente excluído com sucesso!')
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de clientes"
        actions={
          <Button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            <Plus size={16} />
            Novo Cliente
          </Button>
        }
      />

      {pageError && (
        <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mb-4">
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
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Nenhum cliente cadastrado.
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const wa = whatsappLink(client.phone)
                return (
                  <tr
                    key={client.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      <span className="inline-flex items-center gap-2">
                        {client.name}
                        {client.attachment_count > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-surface-alt text-text-secondary px-2 py-0.5 text-[11px] font-medium"
                            title={`${client.attachment_count} anexo(s)`}
                          >
                            <Paperclip size={11} /> {client.attachment_count}
                          </span>
                        )}
                        {client.admin_only && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5 text-[11px] font-medium"
                            title="Visível apenas para administradores"
                          >
                            <Lock size={11} /> Só admin
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{client.email || '-'}</td>
                    <td className="px-4 py-3">
                      {client.phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-text-secondary">{client.phone}</span>
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
                      {client.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => startEdit(client)}
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Editar
                      </button>
                      {canDeleteClients && (
                        <button
                          onClick={() => {
                            setClientToDelete(client)
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
        title={editingClient ? 'Editar Cliente' : 'Novo Cliente'}
      >
        {error && (
          <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mb-4">
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
          {editingClient && (
            <div className="rounded-lg border border-border-subtle p-3">
              <ClientAttachments clientId={editingClient.id} />
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
          <Button type="submit" className="w-full">
            {editingClient ? 'Salvar' : 'Criar Cliente'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(clientToDelete)}
        onClose={() => {
          setClientToDelete(null)
          setDeleteError('')
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setClientToDelete(null)
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
            Excluir cliente?
          </h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{clientToDelete?.name}</strong>
          </p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Esta ação remove o cadastro.
          </p>
          <p className="text-text-secondary">
            Confira se este cliente não será mais necessário antes de continuar.
          </p>
        </div>
        {deleteError && (
          <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mt-3">
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
