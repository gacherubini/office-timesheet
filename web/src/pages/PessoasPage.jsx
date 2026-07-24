import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { roleLabel } from '../lib/permissions'

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

// Metadados de cada "legenda" (aba) do mockup VOID.
// Cores alinhadas ao mockup: Cliente=azul, Colaborador=verde, Fornecedor=âmbar.
const KINDS = {
  cliente: { label: 'Clientes', singular: 'Cliente', tone: 'info', icon: Briefcase },
  colaborador: { label: 'Colaboradores', singular: 'Colaborador', tone: 'success', icon: Users },
  fornecedor: { label: 'Fornecedores', singular: 'Fornecedor', tone: 'warning', icon: Truck },
  excluido: { label: 'Excluídos', singular: 'Excluído', tone: 'danger', icon: Trash2 },
}

// Chip de aba (legenda) com contador.
function TabChip({ active, label, count, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-transparent bg-[color:var(--color-accent)] text-white'
          : 'border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-alt'
      }`}
    >
      {label}
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums ${
          active ? 'bg-white/25 text-white' : 'bg-surface-alt text-text-secondary'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

export function PessoasPage() {
  const { isAdmin, canAccessAdminArea, canManageClients, canManageSuppliers } = useAuth()
  const navigate = useNavigate()

  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [tab, setTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNewChooser, setShowNewChooser] = useState(false)
  const [restoringId, setRestoringId] = useState(null)

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

  const tabs = [
    { key: 'todos', label: 'Todos', tone: 'neutral' },
    { key: 'cliente', label: KINDS.cliente.label, tone: KINDS.cliente.tone },
    { key: 'colaborador', label: KINDS.colaborador.label, tone: KINDS.colaborador.tone },
    { key: 'fornecedor', label: KINDS.fornecedor.label, tone: KINDS.fornecedor.tone },
    ...(isAdmin ? [{ key: 'excluido', label: KINDS.excluido.label, tone: KINDS.excluido.tone }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Pessoas"
        subtitle="Clientes, colaboradores e fornecedores num só lugar"
        actions={
          <Button onClick={() => setShowNewChooser(true)}>
            <Plus size={16} />
            Nova pessoa
          </Button>
        }
      />

      {pageError && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {pageError}
        </div>
      )}

      {/* Legendas (abas) do mockup */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tabs.map((t) => (
          <TabChip
            key={t.key}
            active={tab === t.key}
            label={t.label}
            count={counts[t.key] || 0}
            tone={t.tone}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou telefone..."
          className="form-control w-full rounded-lg border pl-9 pr-3 py-2 text-sm outline-none transition-colors"
        />
      </div>

      <Card padded={false}>
        {loading ? (
          <p className="text-center py-12 text-text-secondary text-sm">Carregando...</p>
        ) : visible.length === 0 ? (
          <p className="text-center py-12 text-text-secondary text-sm">
            {search ? 'Nenhuma pessoa encontrada.' : 'Nenhuma pessoa nesta categoria.'}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {visible.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                onOpen={() => setSelected(p)}
                onRestore={() => handleRestore(p)}
                restoring={restoringId === p.rawId}
                canRestore={isAdmin}
              />
            ))}
          </ul>
        )}
      </Card>

      <PersonDetailModal
        person={selected}
        onClose={() => setSelected(null)}
        onRestore={handleRestore}
        restoring={selected ? restoringId === selected.rawId : false}
        canRestore={isAdmin}
        canEdit={
          selected
            ? (selected.kind === 'cliente' && canManageClients) ||
              (selected.kind === 'fornecedor' && canManageSuppliers) ||
              (selected.kind === 'colaborador' && isAdmin)
            : false
        }
        onEdit={(p) => {
          setSelected(null)
          if (p.kind === 'cliente') navigate('/clients')
          else if (p.kind === 'fornecedor') navigate('/suppliers')
          else if (p.kind === 'colaborador') navigate('/admin/team')
        }}
      />

      <NewPersonChooser
        open={showNewChooser}
        onClose={() => setShowNewChooser(false)}
        onPick={(kind) => {
          setShowNewChooser(false)
          if (kind === 'cliente') navigate('/clients')
          else if (kind === 'fornecedor') navigate('/suppliers')
          else if (kind === 'colaborador') navigate('/admin/team')
        }}
        canManageClients={canManageClients}
        canManageSuppliers={canManageSuppliers}
        canManageColaboradores={isAdmin}
      />
    </div>
  )
}

// Linha da lista: avatar, nome, subtítulo, badge de tipo e contato.
function PersonRow({ person, onOpen, onRestore, restoring, canRestore }) {
  const kind = KINDS[person.kind]
  const wa = whatsappLink(person.phone)
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors">
      <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <Avatar name={person.name} url={person.avatarUrl} size={40} />
        <div className="min-w-0">
          <p className="font-medium text-text-primary truncate flex items-center gap-2">
            {person.name}
            {person.adminOnly && (
              <span title="Visível só para admins" className="text-amber-500">
                <Lock size={12} />
              </span>
            )}
          </p>
          <p className="text-[13px] text-text-secondary truncate">{person.subtitle}</p>
        </div>
      </button>

      <Badge tone={kind.tone} className="hidden sm:inline-flex flex-none">
        {kind.singular}
      </Badge>

      <div className="hidden md:flex items-center gap-2 w-56 flex-none">
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
            className="text-emerald-500 hover:text-emerald-400 p-1 rounded hover:bg-emerald-500/10 transition-colors flex-none"
          >
            <MessageCircle size={16} />
          </a>
        )}
      </div>

      {person.kind === 'excluido' && canRestore ? (
        <button
          onClick={onRestore}
          disabled={restoring}
          className="inline-flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-400 disabled:opacity-50 transition-colors flex-none"
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
function PersonDetailModal({ person, onClose, onRestore, restoring, canRestore, canEdit, onEdit }) {
  if (!person) return null
  const kind = KINDS[person.kind]
  const raw = person.raw
  const wa = whatsappLink(person.phone)

  return (
    <Modal open={Boolean(person)} onClose={onClose} size="lg">
      <div className="flex items-start gap-4 mb-5">
        <Avatar name={person.name} url={person.avatarUrl} size={56} />
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle px-4">
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
            <DetailRow label="Status">{raw.is_active === false ? 'Inativo' : 'Ativo'}</DetailRow>
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

      <div className="mt-4 rounded-lg bg-surface-alt p-3 text-[13px] text-text-secondary">
        Histórico CRM, documentos e projetos vinculados chegam na próxima etapa.
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-400 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-colors"
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        )}
        {person.email && (
          <a
            href={`mailto:${person.email}`}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <Mail size={15} /> E-mail
          </a>
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
              className="w-full flex items-center gap-3 rounded-lg border border-border-subtle p-3 text-left hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span className="w-10 h-10 rounded-lg bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center flex-none">
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
