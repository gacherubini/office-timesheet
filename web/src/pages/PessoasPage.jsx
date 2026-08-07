import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import {
  Search,
  Plus,
  MessageCircle,
  Mail,
  Lock,
  RotateCcw,
  Users,
  Briefcase,
  Truck,
  Trash2,
  X,
  ChevronRight,
  Pencil,
  Camera,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { ClientFormModal } from '../components/ClientFormModal'
import { SupplierFormModal } from '../components/SupplierFormModal'
import { ROLES, roleLabel } from '../lib/permissions'

function whatsappLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Remuneração exibida conforme o perfil: Estagiário Administrativo tem salário
// fixo mensal; os demais perfis têm valor por hora.
function compensationLabel(user) {
  if (user.role === ROLES.ADMINISTRATIVE_INTERN) {
    return `${formatCurrency(user.fixed_salary)} / mês`
  }
  return `${formatCurrency(user.hourly_rate)} / hora`
}

const EMPTY_COLLABORATOR_FORM = {
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
}

// Metadados de cada "legenda" (aba) do mockup VOID.
// Cores alinhadas ao mockup: Cliente=azul, Colaborador=verde, Fornecedor=âmbar.
const KINDS = {
  cliente: { label: 'Clientes', singular: 'Cliente', tone: 'info', icon: Briefcase },
  colaborador: { label: 'Colaboradores', singular: 'Colaborador', tone: 'success', icon: Users },
  fornecedor: { label: 'Fornecedores', singular: 'Fornecedor', tone: 'warning', icon: Truck },
  excluido: { label: 'Excluídos', singular: 'Excluído', tone: 'danger', icon: Trash2 },
}

// Chip de filtro (legenda) com contador.
function TabChip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-2 border px-3 text-[12px] transition-colors ${
        active
          ? 'border-ink bg-ink text-white'
          : 'border-border-subtle bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
      <span className="text-[10.5px] tabular-nums opacity-65">{count}</span>
    </button>
  )
}

export function PessoasPage() {
  const {
    isAdmin,
    canAccessAdminArea,
    canAccessMoney,
    canManageClients,
    canManageSuppliers,
    canDeleteClients,
    canDeleteSuppliers,
  } = useAuth()

  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [tab, setTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNewChooser, setShowNewChooser] = useState(false)
  const [restoringId, setRestoringId] = useState(null)

  // Gestão de colaboradores (portada da antiga página "Equipe").
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(EMPTY_COLLABORATOR_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const fileInputRef = useRef(null)

  // Gestão de clientes e fornecedores (portada das antigas páginas admin).
  const [clientModal, setClientModal] = useState({ open: false, client: null })
  const [supplierModal, setSupplierModal] = useState({ open: false, supplier: null })
  const [contactToDelete, setContactToDelete] = useState(null) // { kind, raw }
  const [contactDeleteError, setContactDeleteError] = useState('')
  const [contactDeleting, setContactDeleting] = useState(false)

  async function loadPeople() {
    setPageError('')
    setLoading(true)

    // Cada fonte é independente: se uma falhar (ex.: sem permissão), as outras
    // ainda carregam. Colaboradores usam o endpoint completo para admin/estagiário
    // e o básico (sem e-mail/telefone) para os demais perfis.
    const sources = [
      api.get('/admin/clients').then((rows) => ({ kind: 'cliente', rows })),
      api.get('/admin/suppliers').then((rows) => ({ kind: 'fornecedor', rows })),
      (canAccessAdminArea ? api.get('/admin/users') : api.get('/users/basic')).then((rows) => ({
        kind: 'colaborador',
        rows,
      })),
      ...(isAdmin
        ? [api.get('/admin/users/deleted').then((rows) => ({ kind: 'excluido', rows }))]
        : []),
    ]

    const results = await Promise.allSettled(sources)
    const normalized = []
    let anyOk = false

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      anyOk = true
      const { kind, rows } = result.value
      for (const row of rows || []) {
        normalized.push(normalizePerson(kind, row))
      }
    }

    if (!anyOk) setPageError('Não foi possível carregar as pessoas.')
    setPeople(normalized)
    setLoading(false)
  }

  useEffect(() => {
    loadPeople()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function normalizePerson(kind, row) {
    if (kind === 'cliente') {
      return {
        id: `cliente-${row.id}`,
        rawId: row.id,
        kind: 'cliente',
        name: row.name,
        subtitle: 'Pessoa física',
        email: row.email || '',
        phone: row.phone || '',
        avatarUrl: null,
        adminOnly: Boolean(row.admin_only),
        raw: row,
      }
    }
    if (kind === 'fornecedor') {
      return {
        id: `fornecedor-${row.id}`,
        rawId: row.id,
        kind: 'fornecedor',
        name: row.name,
        subtitle: row.category || 'Fornecedor',
        email: row.email || '',
        phone: row.phone || '',
        avatarUrl: null,
        adminOnly: Boolean(row.admin_only),
        raw: row,
      }
    }
    if (kind === 'excluido') {
      return {
        id: `excluido-${row.id}`,
        rawId: row.id,
        kind: 'excluido',
        name: row.name,
        subtitle: `${roleLabel(row.role)} · removido em ${formatDate(row.deleted_at)}`,
        email: row.email || '',
        phone: '',
        avatarUrl: null,
        adminOnly: false,
        raw: row,
      }
    }
    // colaborador
    return {
      id: `colaborador-${row.id}`,
      rawId: row.id,
      kind: 'colaborador',
      name: row.name,
      subtitle: row.position || roleLabel(row.role) || 'Usuário do sistema',
      email: row.email || '',
      phone: row.phone || '',
      avatarUrl: row.avatar_url || null,
      adminOnly: false,
      raw: row,
    }
  }

  const counts = useMemo(() => {
    const c = { todos: 0, cliente: 0, colaborador: 0, fornecedor: 0, excluido: 0 }
    for (const p of people) {
      c[p.kind] = (c[p.kind] || 0) + 1
      if (p.kind !== 'excluido') c.todos += 1
    }
    return c
  }, [people])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return people
      .filter((p) => (tab === 'todos' ? p.kind !== 'excluido' : p.kind === tab))
      .filter((p) => {
        if (!term) return true
        return (
          p.name?.toLowerCase().includes(term) ||
          p.email?.toLowerCase().includes(term) ||
          p.phone?.toLowerCase().includes(term) ||
          p.subtitle?.toLowerCase().includes(term)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [people, tab, search])

  async function handleRestore(person) {
    setRestoringId(person.rawId)
    try {
      await api.post(`/admin/users/${person.rawId}/restore`, {})
      await loadPeople()
      setSelected(null)
    } catch (err) {
      setPageError(err.message)
    } finally {
      setRestoringId(null)
    }
  }

  // ---- CRUD de colaborador (portado da antiga página "Equipe") ----

  function resetForm() {
    setForm(EMPTY_COLLABORATOR_FORM)
    setEditingUser(null)
    setShowForm(false)
    setFormError('')
  }

  // Abre o formulário in-page já preenchido. Recebe o registro completo do
  // colaborador (person.raw vindo de /admin/users).
  function startEditColaborador(user) {
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || ROLES.EMPLOYEE,
      hourly_rate: user.hourly_rate || '',
      fixed_salary: user.fixed_salary || '',
      is_active: user.is_active,
      position: user.position || '',
      birth_date: user.birth_date || '',
      phone: user.phone || '',
    })
    setEditingUser(user)
    setShowForm(true)
    setFormError('')
  }

  function startCreateColaborador() {
    resetForm()
    setShowForm(true)
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
      await loadPeople()
    } catch (err) {
      alert(err.message || 'Erro ao enviar imagem.')
    } finally {
      setUploadingId(null)
      e.target.value = ''
    }
  }

  async function handleDeleteColaborador() {
    if (!userToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${userToDelete.id}`)
      setUserToDelete(null)
      setSelected(null)
      await loadPeople()
      setSuccessMessage('Colaborador excluído com sucesso!')
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmitColaborador(e) {
    e.preventDefault()
    setFormError('')
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

      await loadPeople()
      resetForm()
      setSuccessMessage(
        wasEditing ? 'Colaborador atualizado com sucesso!' : 'Colaborador cadastrado com sucesso!'
      )
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- CRUD de cliente e fornecedor (portado das antigas páginas admin) ----

  function startCreateClient() {
    setClientModal({ open: true, client: null })
  }

  function startEditClient(client) {
    setClientModal({ open: true, client })
  }

  function startCreateSupplier() {
    setSupplierModal({ open: true, supplier: null })
  }

  function startEditSupplier(supplier) {
    setSupplierModal({ open: true, supplier })
  }

  async function handleContactSaved(message) {
    setClientModal({ open: false, client: null })
    setSupplierModal({ open: false, supplier: null })
    await loadPeople()
    setSuccessMessage(message)
  }

  async function handleDeleteContact() {
    if (!contactToDelete) return
    setContactDeleteError('')
    setContactDeleting(true)
    try {
      const base = contactToDelete.kind === 'cliente' ? '/admin/clients' : '/admin/suppliers'
      await api.delete(`${base}/${contactToDelete.raw.id}`)
      const kind = contactToDelete.kind
      setContactToDelete(null)
      await loadPeople()
      setSuccessMessage(
        kind === 'cliente' ? 'Cliente excluído com sucesso!' : 'Fornecedor excluído com sucesso!'
      )
    } catch (err) {
      setContactDeleteError(err.message)
    } finally {
      setContactDeleting(false)
    }
  }

  const tabs = [
    { key: 'todos', label: 'Todos' },
    { key: 'cliente', label: KINDS.cliente.label },
    { key: 'colaborador', label: KINDS.colaborador.label },
    { key: 'fornecedor', label: KINDS.fornecedor.label },
    ...(isAdmin ? [{ key: 'excluido', label: KINDS.excluido.label }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Pessoas"
        subtitle="Clientes, colaboradores e fornecedores num só lugar"
      />

      {pageError && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {pageError}
        </div>
      )}

      {/* Faixa de controle: busca → filtros → ação primária */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="form-control h-8 w-full border pl-8 pr-3 text-[12px] outline-none transition-colors"
          />
        </div>
        {tabs.map((t) => (
          <TabChip key={t.key} active={tab === t.key} label={t.label} count={counts[t.key] || 0} onClick={() => setTab(t.key)} />
        ))}
        <Button className="ml-auto h-8" onClick={() => setShowNewChooser(true)}>
          <Plus size={15} /> Nova pessoa
        </Button>
      </div>

      <Card padded={false}>
        {loading ? (
          <p className="text-center py-12 text-text-secondary text-sm">Carregando...</p>
        ) : visible.length === 0 ? (
          <p className="text-center py-12 text-text-secondary text-sm">
            {search ? 'Nenhuma pessoa encontrada.' : 'Nenhuma pessoa nesta categoria.'}
          </p>
        ) : (
          <>
            {/* Cabeçalho de colunas — diz o que é cada valor da linha. */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-bg text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
              <span className="flex-1">Nome</span>
              <span className="w-28 flex-none">Tipo</span>
              <span className="w-20 flex-none">Status</span>
              {canAccessMoney && <span className="hidden lg:block w-40 flex-none">Remuneração</span>}
              <span className="hidden md:block w-44 flex-none">Contato</span>
              <span className="w-8 flex-none" aria-hidden="true" />
            </div>
            <ul className="divide-y divide-border-subtle">
              {visible.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  onOpen={() => setSelected(p)}
                  onRestore={() => handleRestore(p)}
                  restoring={restoringId === p.rawId}
                  canRestore={isAdmin}
                  canAccessMoney={canAccessMoney}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Input de arquivo (oculto) compartilhado para upload de foto de colaborador. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      <PersonDetailModal
        person={selected}
        onClose={() => setSelected(null)}
        onRestore={handleRestore}
        restoring={selected ? restoringId === selected.rawId : false}
        canRestore={isAdmin}
        isAdmin={isAdmin}
        canAccessMoney={canAccessMoney}
        canEdit={
          selected
            ? (selected.kind === 'cliente' && canManageClients) ||
              (selected.kind === 'fornecedor' && canManageSuppliers) ||
              (selected.kind === 'colaborador' && isAdmin)
            : false
        }
        canDelete={
          selected
            ? (selected.kind === 'cliente' && canDeleteClients) ||
              (selected.kind === 'fornecedor' && canDeleteSuppliers) ||
              (selected.kind === 'colaborador' && isAdmin)
            : false
        }
        onEdit={(p) => {
          setSelected(null)
          if (p.kind === 'colaborador') startEditColaborador(p.raw)
          else if (p.kind === 'cliente') startEditClient(p.raw)
          else if (p.kind === 'fornecedor') startEditSupplier(p.raw)
        }}
        onDelete={(p) => {
          setSelected(null)
          if (p.kind === 'colaborador') {
            setDeleteError('')
            setUserToDelete(p.raw)
          } else if (p.kind === 'cliente' || p.kind === 'fornecedor') {
            setContactDeleteError('')
            setContactToDelete({ kind: p.kind, raw: p.raw })
          }
        }}
        onUploadAvatar={(p) => triggerUpload(p.rawId)}
        uploading={selected ? uploadingId === selected.rawId : false}
      />

      <NewPersonChooser
        open={showNewChooser}
        onClose={() => setShowNewChooser(false)}
        onPick={(kind) => {
          setShowNewChooser(false)
          if (kind === 'cliente') startCreateClient()
          else if (kind === 'fornecedor') startCreateSupplier()
          else if (kind === 'colaborador') startCreateColaborador()
        }}
        canManageClients={canManageClients}
        canManageSuppliers={canManageSuppliers}
        canManageColaboradores={isAdmin}
      />

      {/* Formulário de criar/editar colaborador (portado da página "Equipe"). */}
      <Modal
        open={showForm}
        onClose={() => {
          if (!saving) resetForm()
        }}
        closeOnBackdrop={false}
        title={editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}
      >
        {formError && (
          <div className="state-danger-soft text-sm p-3 mb-4">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmitColaborador} className="space-y-3" autoComplete="off">
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
              showYearDropdown
              showMonthDropdown
              max={new Date()}
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
              <option value={ROLES.PROJECT_MANAGER}>Gestor de Projetos</option>
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
                className="border-border-subtle"
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

      {/* Confirmação de exclusão de colaborador. */}
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
            <Button variant="danger" onClick={handleDeleteColaborador} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="state-danger-soft p-4 mb-4">
            <AlertTriangle className="state-danger" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">Excluir colaborador?</h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{userToDelete?.name}</strong>
          </p>
        </div>
        <div className="state-success-soft border border-border-subtle p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">Os apontamentos serão preservados.</p>
          <p className="text-text-secondary">
            Você pode restaurar este colaborador a qualquer momento na aba{' '}
            <strong className="text-text-primary">Excluídos</strong>.
          </p>
        </div>
        {deleteError && (
          <div className="state-danger-soft text-sm p-3 mt-3">
            {deleteError}
          </div>
        )}
      </Modal>

      {/* Formulário de criar/editar cliente (portado da página "Clientes"). */}
      <ClientFormModal
        open={clientModal.open}
        client={clientModal.client}
        isAdmin={isAdmin}
        onClose={() => setClientModal({ open: false, client: null })}
        onSaved={handleContactSaved}
      />

      {/* Formulário de criar/editar fornecedor (portado da página "Fornecedores"). */}
      <SupplierFormModal
        open={supplierModal.open}
        supplier={supplierModal.supplier}
        isAdmin={isAdmin}
        onClose={() => setSupplierModal({ open: false, supplier: null })}
        onSaved={handleContactSaved}
      />

      {/* Confirmação de exclusão de cliente/fornecedor. */}
      <Modal
        open={Boolean(contactToDelete)}
        onClose={() => {
          setContactToDelete(null)
          setContactDeleteError('')
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setContactToDelete(null)
                setContactDeleteError('')
              }}
              disabled={contactDeleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteContact} disabled={contactDeleting}>
              {contactDeleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="state-danger-soft p-4 mb-4">
            <AlertTriangle className="state-danger" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">
            {contactToDelete?.kind === 'cliente' ? 'Excluir cliente?' : 'Excluir fornecedor?'}
          </h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{contactToDelete?.raw?.name}</strong>
          </p>
        </div>
        <div className="state-danger-soft border border-border-subtle p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">Esta ação remove o cadastro.</p>
          <p className="text-text-secondary">
            {contactToDelete?.kind === 'cliente'
              ? 'Confira se este cliente não será mais necessário antes de continuar.'
              : 'Confira se este fornecedor não será mais necessário antes de continuar.'}
          </p>
        </div>
        {contactDeleteError && (
          <div className="state-danger-soft text-sm p-3 mt-3">
            {contactDeleteError}
          </div>
        )}
      </Modal>

      {/* Modal de sucesso (criar/editar/excluir). */}
      <Modal
        open={Boolean(successMessage)}
        onClose={() => setSuccessMessage('')}
        size="sm"
        footer={<Button onClick={() => setSuccessMessage('')}>OK</Button>}
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="state-success-soft p-4 mb-4">
            <CheckCircle2 className="state-success" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>
    </div>
  )
}

// Linha da lista: avatar, nome, subtítulo, badge de tipo e contato.
function PersonRow({ person, onOpen, onRestore, restoring, canRestore, canAccessMoney }) {
  const kind = KINDS[person.kind]
  const wa = whatsappLink(person.phone)
  const isColaborador = person.kind === 'colaborador'
  const raw = person.raw
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors">
      <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <Avatar name={person.name} url={person.avatarUrl} size={40} />
        <div className="min-w-0">
          <p className="font-medium text-text-primary truncate flex items-center gap-2">
            {person.name}
            {person.adminOnly && (
              <span title="Visível só para admins" className="state-attention">
                <Lock size={12} />
              </span>
            )}
          </p>
          <p className="text-[13px] text-text-secondary truncate">{person.subtitle}</p>
        </div>
      </button>

      <div className="hidden sm:block w-28 flex-none">
        <Badge tone={kind.tone}>{kind.singular}</Badge>
      </div>

      <div className="hidden sm:block w-20 flex-none">
        {isColaborador && (
          <Badge tone={raw.is_active === false ? 'danger' : 'success'}>
            {raw.is_active === false ? 'Inativo' : 'Ativo'}
          </Badge>
        )}
      </div>

      {canAccessMoney && (
        <div className="hidden lg:block w-40 flex-none">
          {isColaborador ? (
            <span className="text-[13px] text-text-primary tabular-nums truncate">
              {compensationLabel(raw)}
            </span>
          ) : (
            <span className="text-[13px] text-text-secondary/60">—</span>
          )}
        </div>
      )}

      <div className="hidden md:flex items-center gap-2 w-44 flex-none">
        {person.phone ? (
          <span className="text-[13px] text-text-secondary truncate">{person.phone}</span>
        ) : person.email ? (
          <span className="text-[13px] text-text-secondary truncate">{person.email}</span>
        ) : (
          <span className="text-[13px] text-text-secondary/60">—</span>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir WhatsApp"
            className="state-success hover:bg-surface-alt hover:opacity-80 p-1 transition-colors flex-none"
          >
            <MessageCircle size={16} />
          </a>
        )}
      </div>

      {person.kind === 'excluido' && canRestore ? (
        <button
          onClick={onRestore}
          disabled={restoring}
          className="inline-flex items-center gap-1.5 text-sm state-success hover:opacity-80 disabled:opacity-50 transition-colors flex-none"
        >
          <RotateCcw size={14} />
          {restoring ? 'Restaurando...' : 'Restaurar'}
        </button>
      ) : (
        <button onClick={onOpen} className="text-text-secondary hover:text-text-primary flex-none p-1" title="Ver detalhes">
          <ChevronRight size={18} />
        </button>
      )}
    </li>
  )
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 border-b border-border-subtle last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-text-secondary pt-0.5">{label}</span>
      <span className="text-sm text-text-primary break-words">{children || '—'}</span>
    </div>
  )
}

// Pop-up de detalhe (mockup pág. 10). Mostra os campos que temos por tipo;
// CRM, documentos e projetos vinculados ficam para a próxima etapa.
function PersonDetailModal({
  person,
  onClose,
  onRestore,
  restoring,
  canRestore,
  canEdit,
  canDelete,
  onEdit,
  isAdmin,
  canAccessMoney,
  onDelete,
  onUploadAvatar,
  uploading,
}) {
  if (!person) return null
  const kind = KINDS[person.kind]
  const raw = person.raw
  const wa = whatsappLink(person.phone)
  const canManageColaborador = person.kind === 'colaborador' && isAdmin

  return (
    <Modal open={Boolean(person)} onClose={onClose} size="lg">
      <div className="flex items-start gap-4 mb-5">
        {canManageColaborador ? (
          <button
            type="button"
            onClick={() => onUploadAvatar(person)}
            disabled={uploading}
            title="Clique para alterar a foto"
            className="relative group flex-none disabled:opacity-60"
          >
            <Avatar name={person.name} url={person.avatarUrl} size={56} />
            <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
              <Camera size={16} className="text-white opacity-0 group-hover:opacity-100" />
            </span>
          </button>
        ) : (
          <Avatar name={person.name} url={person.avatarUrl} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-2xl text-text-primary leading-tight">{person.name}</h3>
            <Badge tone={kind.tone}>{kind.singular}</Badge>
            {person.adminOnly && (
              <Badge tone="warning">
                <Lock size={11} className="mr-1" /> Só admin
              </Badge>
            )}
          </div>
          <p className="text-[13px] text-text-secondary mt-0.5">{person.subtitle}</p>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {canEdit && (
            <button
              onClick={() => onEdit(person)}
              className="inline-flex items-center gap-1.5 border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="border border-border-subtle px-4">
        {person.kind === 'cliente' && (
          <>
            <DetailRow label="E-mail">{raw.email}</DetailRow>
            <DetailRow label="Telefone">{raw.phone}</DetailRow>
            <DetailRow label="CPF">{raw.cpf}</DetailRow>
            <DetailRow label="Nascimento">{raw.birth_date ? formatDate(raw.birth_date) : ''}</DetailRow>
            <DetailRow label="Endereço">{raw.address}</DetailRow>
            <DetailRow label="Observações">{raw.notes}</DetailRow>
          </>
        )}
        {person.kind === 'fornecedor' && (
          <>
            <DetailRow label="Categoria">{raw.category}</DetailRow>
            <DetailRow label="E-mail">{raw.email}</DetailRow>
            <DetailRow label="Telefone">{raw.phone}</DetailRow>
            <DetailRow label="Observações">{raw.notes}</DetailRow>
          </>
        )}
        {person.kind === 'colaborador' && (
          <>
            <DetailRow label="E-mail">{raw.email}</DetailRow>
            <DetailRow label="Telefone">{raw.phone}</DetailRow>
            <DetailRow label="Perfil">{roleLabel(raw.role)}</DetailRow>
            {canAccessMoney && (
              <DetailRow label="Remuneração">{compensationLabel(raw)}</DetailRow>
            )}
            <DetailRow label="Status">
              <Badge tone={raw.is_active === false ? 'danger' : 'success'}>
                {raw.is_active === false ? 'Inativo' : 'Ativo'}
              </Badge>
            </DetailRow>
          </>
        )}
        {person.kind === 'excluido' && (
          <>
            <DetailRow label="E-mail">{raw.email}</DetailRow>
            <DetailRow label="Perfil">{roleLabel(raw.role)}</DetailRow>
            <DetailRow label="Removido em">{formatDate(raw.deleted_at)}</DetailRow>
          </>
        )}
      </div>

      <div className="mt-4 bg-surface-alt p-3 text-[13px] text-text-secondary">
        Histórico CRM, documentos e projetos vinculados chegam na próxima etapa.
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm state-success hover:bg-surface-alt hover:opacity-80 px-3 py-2 transition-colors"
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        )}
        {person.email && (
          <a
            href={`mailto:${person.email}`}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary px-3 py-2 hover:bg-surface-alt transition-colors"
          >
            <Mail size={15} /> E-mail
          </a>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(person)}
            className="inline-flex items-center gap-1.5 text-sm state-danger hover:bg-surface-alt hover:opacity-80 px-3 py-2 transition-colors"
          >
            <Trash2 size={15} /> Excluir
          </button>
        )}
        {person.kind === 'excluido' && canRestore && (
          <Button onClick={() => onRestore(person)} disabled={restoring}>
            <RotateCcw size={15} />
            {restoring ? 'Restaurando...' : 'Restaurar'}
          </Button>
        )}
      </div>
    </Modal>
  )
}

// Escolha do tipo ao criar (mockup: PF/PJ e tipos). A criação em si reusa as
// telas existentes por enquanto — o cadastro unificado é a próxima etapa.
function NewPersonChooser({
  open,
  onClose,
  onPick,
  canManageClients,
  canManageSuppliers,
  canManageColaboradores,
}) {
  const options = [
    { kind: 'cliente', label: 'Cliente', desc: 'Pessoa física atendida', icon: Briefcase, allowed: canManageClients },
    { kind: 'fornecedor', label: 'Fornecedor', desc: 'Parceiro ou prestador', icon: Truck, allowed: canManageSuppliers },
    { kind: 'colaborador', label: 'Colaborador', desc: 'Usuário do sistema', icon: Users, allowed: canManageColaboradores },
  ]
  return (
    <Modal open={open} onClose={onClose} title="Nova pessoa" size="md">
      <p className="text-sm text-text-secondary mb-4">Que tipo de cadastro você quer criar?</p>
      <div className="space-y-2">
        {options.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.kind}
              disabled={!opt.allowed}
              onClick={() => onPick(opt.kind)}
              className="w-full flex items-center gap-3 border border-border-subtle p-3 text-left hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span className="w-10 h-10 bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center flex-none">
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-text-primary">{opt.label}</span>
                <span className="block text-[13px] text-text-secondary">
                  {opt.allowed ? opt.desc : 'Sem permissão'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[12px] text-text-secondary mt-4">
        O cadastro unificado (PF/PJ com múltiplos tipos e Parceiros) chega na próxima etapa. Por
        enquanto, cada tipo abre o cadastro atual.
      </p>
    </Modal>
  )
}
