import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Plus, AlertTriangle, CheckCircle2, Trash2, Camera, MessageCircle } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { DateField } from '../../components/ui/DateField'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ROLES, roleLabel } from '../../lib/permissions'
import { useAuth } from '../../contexts/AuthContext'

function whatsappLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function roleBadgeTone(role) {
  if (role === ROLES.ADMIN) return 'accent'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'warning'
  return 'info'
}

function compensationLabel(user) {
  if (user.role === ROLES.ADMINISTRATIVE_INTERN) {
    return `${formatCurrency(user.fixed_salary)} / mês`
  }

  return `${formatCurrency(user.hourly_rate)} / hora`
}

export function AdminTeamPage() {
  const { isAdmin, canAccessMoney } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: ROLES.EMPLOYEE,
    hourly_rate: '',
    fixed_salary: '',
    is_active: true,
    position: '',
    birth_date: '',
    phone: '',
  })
  const [uploadingId, setUploadingId] = useState(null)
  const fileInputRef = useRef(null)

  async function loadUsers() {
    try {
      const data = await api.get('/admin/users')
      setUsers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  function resetForm() {
    setForm({
      name: '',
      email: '',
      password: '',
      role: ROLES.EMPLOYEE,
      hourly_rate: '',
      fixed_salary: '',
      is_active: true,
      position: '',
      birth_date: '',
      phone: '',
    })
    setEditingUser(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(user) {
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      hourly_rate: user.hourly_rate || '',
      fixed_salary: user.fixed_salary || '',
      is_active: user.is_active,
      position: user.position || '',
      birth_date: user.birth_date || '',
      phone: user.phone || '',
    })
    setEditingUser(user)
    setShowForm(true)
    setError('')
  }

  function triggerUpload(userId) {
    setUploadingId(userId)
    fileInputRef.current?.click()
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !uploadingId) return

    const formData = new FormData()
    formData.append('image', file)

    try {
      const token = localStorage.getItem('access_token')
      const baseUrl = import.meta.env.VITE_API_URL ?? '/api'
      const res = await fetch(`${baseUrl}/admin/users/${uploadingId}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      loadUsers()
    } catch (err) {
      alert(err.message || 'Erro ao enviar imagem.')
    } finally {
      setUploadingId(null)
      e.target.value = ''
    }
  }

  async function handleDelete() {
    if (!userToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${userToDelete.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
      setUserToDelete(null)
      setSuccessMessage('Colaborador excluído com sucesso!')
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const isAdministrativeIntern = form.role === ROLES.ADMINISTRATIVE_INTERN
    const payload = {
      name: form.name,
      role: form.role,
      hourly_rate: isAdministrativeIntern ? 0 : Number(form.hourly_rate) || 0,
      fixed_salary: isAdministrativeIntern ? Number(form.fixed_salary) || 0 : 0,
      is_active: form.is_active,
      position: roleLabel(form.role),
      birth_date: form.birth_date,
      phone: form.phone,
    }

    try {
      const wasEditing = Boolean(editingUser)
      if (wasEditing) {
        await api.put(`/admin/users/${editingUser.id}`, payload)
      } else {
        await api.post('/admin/create-user', {
          ...payload,
          email: form.email,
          password: form.password,
        })
      }

      await loadUsers()
      resetForm()
      setSuccessMessage(wasEditing ? 'Colaborador atualizado com sucesso!' : 'Colaborador cadastrado com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const tableColSpan = 6 + (canAccessMoney ? 1 : 0) + (isAdmin ? 1 : 0)

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Gerencie colaboradores, perfis e taxas horárias"
        actions={
          isAdmin ? (
            <>
            <Link
              to="/admin/deleted-users"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <Trash2 size={14} />
              Excluídos
            </Link>
            <Button
              onClick={() => {
                resetForm()
                setShowForm(true)
              }}
            >
              <Plus size={16} />
              Novo Colaborador
            </Button>
            </>
          ) : null
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Foto
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Nome
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                E-mail
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Contato
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Perfil
              </th>
              {canAccessMoney && (
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Remuneracao
                </th>
              )}
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Status
              </th>
              {isAdmin && (
                <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Acoes
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={tableColSpan} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="text-center py-10 text-text-secondary">
                  Nenhum colaborador cadastrado.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const wa = whatsappLink(user.phone)
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <button
                          onClick={() => triggerUpload(user.id)}
                          title="Clique para alterar a foto"
                          className="relative group"
                        >
                          <Avatar name={user.name} url={user.avatar_url} size={36} />
                          <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                            <Camera size={14} className="text-white opacity-0 group-hover:opacity-100" />
                          </span>
                        </button>
                      ) : (
                        <Avatar name={user.name} url={user.avatar_url} size={36} />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">{user.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-sm">{user.phone}</span>
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
                    <td className="px-4 py-3">
                      <Badge tone={roleBadgeTone(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
                    </td>
                    {canAccessMoney && (
                      <td className="px-4 py-3 tabular-nums text-text-primary">
                        {compensationLabel(user)}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge tone={user.is_active ? 'success' : 'danger'}>
                        {user.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => startEdit(user)}
                            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setUserToDelete(user)
                              setDeleteError('')
                            }}
                            className="text-sm text-rose-500 hover:text-rose-400 transition-colors"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={showForm}
        onClose={() => {
          if (!saving) resetForm()
        }}
        closeOnBackdrop={false}
        title={editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}
      >
        {error && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
          <Input
            label="Nome"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Data de Nascimento"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
            <Input
              label="Telefone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          {!editingUser && (
            <>
              <Input
                label="E-mail"
                type="email"
                autoComplete="new-email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Perfil"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value={ROLES.EMPLOYEE}>Colaborador</option>
              <option value={ROLES.ADMINISTRATIVE_INTERN}>Estagiário Administrativo</option>
              <option value={ROLES.ADMIN}>Administrador</option>
            </Select>
            {form.role === ROLES.ADMINISTRATIVE_INTERN ? (
              <Input
                label="Salário fixo mensal (R$)"
                type="number"
                step="0.01"
                min="0"
                value={form.fixed_salary}
                onChange={(e) => setForm({ ...form, fixed_salary: e.target.value })}
              />
            ) : (
              <Input
                label="Valor/Hora (R$)"
                type="number"
                step="0.01"
                min="0"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
              />
            )}
          </div>

          {editingUser && (
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-border-subtle"
              />
              Ativo
            </label>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving
              ? editingUser
                ? 'Salvando...'
                : 'Criando...'
              : editingUser
                ? 'Salvar'
                : 'Criar Colaborador'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(userToDelete)}
        onClose={() => {
          setUserToDelete(null)
          setDeleteError('')
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setUserToDelete(null)
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
            Excluir colaborador?
          </h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{userToDelete?.name}</strong>
          </p>
        </div>
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Os apontamentos serão preservados.
          </p>
          <p className="text-text-secondary">
            Você pode restaurar este colaborador a qualquer momento na página de{' '}
            <strong className="text-text-primary">Excluídos</strong>.
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
