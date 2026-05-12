import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Plus, Trash2, Pencil, Gift } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../../components/Avatar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  }
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return date.toLocaleDateString('pt-BR')
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function toLocalDateTimeInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIsoUtc(value) {
  if (!value) return null
  // "2026-05-12T01:26" → interpretado como horário local do browser → ISO UTC
  return new Date(value).toISOString()
}

function isSameLocalDate(isoA, isoB) {
  if (!isoA || !isoB) return true
  const a = new Date(isoA)
  const b = new Date(isoB)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDuration(minutes) {
  const totalMinutes = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function statusLabel(status) {
  if (status === 'completed') return 'Salvo'
  if (status === 'running') return 'Em andamento'
  if (status === 'paused') return 'Pausado'
  return status || '-'
}

function SummaryCard({ label, value, accent }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">
        {label}
      </p>
      <p
        className={`font-display text-xl tabular-nums ${
          accent ? 'text-accent' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </Card>
  )
}

export function AdminTimeEntriesPage() {
  const { profile } = useAuth()
  const monthRange = getMonthRange()
  const [entries, setEntries] = useState([])
  const [expenses, setExpenses] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState({
    user_id: '',
    project_id: '',
    start_date: monthRange.start_date,
    end_date: monthRange.end_date,
  })

  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [selectedPauses, setSelectedPauses] = useState(null)
  const [form, setForm] = useState({ user_id: '', project_id: '', started_at: '', ended_at: '' })
  const [error, setError] = useState('')

  const [showBonusForm, setShowBonusForm] = useState(false)
  const [editingBonus, setEditingBonus] = useState(null)
  const [bonusForm, setBonusForm] = useState({
    user_id: '',
    title: '',
    description: '',
    amount: '',
    bonus_date: new Date().toISOString().slice(0, 10),
  })
  const [bonusError, setBonusError] = useState('')
  const [bonusSubmitting, setBonusSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/admin/users'), api.get('/projects')]).then(([u, p]) => {
      setUsers(u)
      setProjects(p)
    })
  }, [])

  async function loadEntries(page = 1) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: 50 })
      if (filters.user_id) params.set('user_id', filters.user_id)
      if (filters.project_id) params.set('project_id', filters.project_id)
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)

      const res = await api.get(`/admin/time-entries?${params}`)
      setEntries(res.data)
      setExpenses(res.expenses || [])
      setBonuses(res.bonuses || [])
      setSummary(res.summary)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFilter(e) {
    e.preventDefault()
    loadEntries(1)
  }

  function resetForm() {
    setForm({ user_id: '', project_id: '', started_at: '', ended_at: '' })
    setEditingEntry(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(entry) {
    setForm({
      user_id: entry.user_id,
      project_id: entry.project_id,
      started_at: toLocalDateTimeInputValue(entry.started_at),
      ended_at: toLocalDateTimeInputValue(entry.ended_at),
    })
    setEditingEntry(entry)
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      const payload = {
        ...form,
        started_at: localInputToIsoUtc(form.started_at),
        ended_at: localInputToIsoUtc(form.ended_at),
      }
      if (editingEntry) {
        await api.put(`/admin/time-entries/${editingEntry.id}`, {
          started_at: payload.started_at,
          ended_at: payload.ended_at,
          project_id: payload.project_id,
        })
      } else {
        await api.post('/admin/time-entries', payload)
      }
      resetForm()
      loadEntries(pagination.page)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este registro?')) return
    try {
      await api.delete(`/admin/time-entries/${id}`)
      loadEntries(pagination.page)
    } catch (err) {
      alert(err.message)
    }
  }

  function openBonusCreate() {
    setEditingBonus(null)
    setBonusForm({
      user_id: '',
      title: '',
      description: '',
      amount: '',
      bonus_date: new Date().toISOString().slice(0, 10),
    })
    setBonusError('')
    setShowBonusForm(true)
  }

  function openBonusEdit(bonus) {
    setEditingBonus(bonus)
    setBonusForm({
      user_id: bonus.user_id,
      title: bonus.title || '',
      description: bonus.description || '',
      amount: bonus.amount ?? '',
      bonus_date: bonus.bonus_date || new Date().toISOString().slice(0, 10),
    })
    setBonusError('')
    setShowBonusForm(true)
  }

  function closeBonusForm() {
    setShowBonusForm(false)
    setEditingBonus(null)
    setBonusError('')
  }

  async function handleBonusSubmit(e) {
    e?.preventDefault?.()
    setBonusSubmitting(true)
    setBonusError('')
    try {
      const payload = {
        user_id: bonusForm.user_id,
        title: bonusForm.title,
        description: bonusForm.description || null,
        amount: Number(bonusForm.amount),
        bonus_date: bonusForm.bonus_date,
      }
      if (editingBonus) {
        await api.put(`/admin/bonuses/${editingBonus.id}`, payload)
      } else {
        await api.post('/admin/bonuses', payload)
      }
      closeBonusForm()
      loadEntries(pagination.page)
    } catch (err) {
      setBonusError(err.message)
    } finally {
      setBonusSubmitting(false)
    }
  }

  async function handleBonusDelete(bonus) {
    if (!confirm(`Excluir o bônus "${bonus.title}"?`)) return
    try {
      await api.delete(`/admin/bonuses/${bonus.id}`)
      loadEntries(pagination.page)
    } catch (err) {
      alert(err.message)
    }
  }

  const selectedUser = users.find((user) => user.id === filters.user_id)
  const dailyTotals = (summary?.daily_totals || []).reduce((acc, item) => {
    acc[`${item.user_id}:${item.date}`] = item.minutes
    return acc
  }, {})

  const localDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const seenDailyKeys = new Set()
  const tableEntries = entries.map((entry) => {
    const date = entry.started_at ? localDateFormatter.format(new Date(entry.started_at)) : null
    const dailyKey = `${entry.user_id}:${date}`
    const showDailyTotal = !seenDailyKeys.has(dailyKey)
    seenDailyKeys.add(dailyKey)
    return {
      ...entry,
      dailyKey,
      dailyTotalMinutes: showDailyTotal ? dailyTotals[dailyKey] : null,
    }
  })

  const totalCost = summary?.total_cost || 0
  const reimbursements = summary?.reimbursements || 0
  const bonusesTotal = summary?.bonuses || 0
  const netTotal = summary?.net_total ?? totalCost + reimbursements + bonusesTotal

  return (
    <div>
      <PageHeader
        title="Histórico da Equipe"
        subtitle={`${profile?.name || 'Administrador'} · Administrador`}
        actions={
          <>
            <Button variant="secondary" onClick={openBonusCreate}>
              <Gift size={16} />
              Adicionar Bônus
            </Button>
            <Button
              onClick={() => {
                resetForm()
                setShowForm(true)
              }}
            >
              <Plus size={16} />
              Adicionar Registro
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <form onSubmit={handleFilter} className="flex flex-col xl:flex-row xl:items-end gap-3">
          <Select
            className="xl:w-64"
            label="Histórico"
            value={filters.user_id}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          >
            <option value="">Toda a equipe</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>

          <Select
            className="xl:w-56"
            label="Projeto"
            value={filters.project_id}
            onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Input
            label="De"
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          <div className="hidden xl:block pb-2 text-text-secondary">→</div>
          <Input
            label="Até"
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />

          <Button type="submit">Filtrar</Button>
        </form>

        <div className="mt-4 flex items-center gap-3 pt-4 border-t border-border-subtle">
          <Avatar name={selectedUser?.name || 'Equipe'} url={selectedUser?.avatar_url} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">
              {selectedUser?.name || 'Toda a equipe'}
            </p>
            <p className="text-xs text-text-secondary truncate">
              {selectedUser?.position || 'Histórico consolidado'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3 mb-4">
        <SummaryCard label="Salário Base / Horas" value={formatCurrency(totalCost)} />
        <SummaryCard label="Reembolso Despesas" value={formatCurrency(reimbursements)} />
        <SummaryCard label="Adicional Bônus" value={formatCurrency(bonusesTotal)} />
        <SummaryCard label="Total Líquido" value={formatCurrency(netTotal)} accent />
        <SummaryCard label="Horas Totais" value={formatDuration(summary?.total_minutes)} />
        <SummaryCard label="Média de Horas/Dia" value={formatDuration(summary?.average_minutes_per_day)} />
        <SummaryCard label="Dias Trabalhados" value={String(summary?.working_days || 0)} />
      </div>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {expenses.length > 0 && (
        <Card padded={false} className="overflow-x-auto mb-4">
          <div className="px-4 py-3 border-b border-border-subtle bg-surface-alt">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Despesas
            </h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-alt">
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Data
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Colaborador
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Despesa
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Valor
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Status
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Comprovante
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                >
                  <td className="px-3 py-3 whitespace-nowrap text-text-primary">
                    {formatDate(expense.expense_date)}
                  </td>
                  <td className="px-3 py-3 min-w-40">
                    <p className="font-medium text-text-primary">
                      {expense.profile?.name || '-'}
                    </p>
                    {expense.profile?.position && (
                      <p className="text-[11px] text-text-secondary">{expense.profile.position}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-56">
                    <p className="font-medium text-text-primary">{expense.title}</p>
                    {expense.description && (
                      <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                        {expense.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium text-text-primary tabular-nums">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge tone={expense.status === 'approved' ? 'success' : 'warning'}>
                      {expense.status === 'approved' ? 'Aprovada' : 'Pendente'}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {expense.receipt_url ? (
                      <a
                        href={expense.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline hover:opacity-80"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span className="text-text-secondary">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {bonuses.length > 0 && (
        <Card padded={false} className="overflow-x-auto mb-4">
          <div className="px-4 py-3 border-b border-border-subtle bg-surface-alt">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Bônus
            </h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-alt">
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Data
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Colaborador
                </th>
                <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Bônus
                </th>
                <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Valor
                </th>
                <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {bonuses.map((bonus) => (
                <tr
                  key={bonus.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                >
                  <td className="px-3 py-3 whitespace-nowrap text-text-primary">
                    {formatDate(bonus.bonus_date)}
                  </td>
                  <td className="px-3 py-3 min-w-40">
                    <p className="font-medium text-text-primary">{bonus.profile?.name || '-'}</p>
                    {bonus.profile?.position && (
                      <p className="text-[11px] text-text-secondary">{bonus.profile.position}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-56">
                    <p className="font-medium text-text-primary">{bonus.title}</p>
                    {bonus.description && (
                      <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                        {bonus.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-medium tabular-nums text-accent">
                    {formatCurrency(bonus.amount)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openBonusEdit(bonus)}
                      className="text-text-secondary hover:text-text-primary mr-2 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleBonusDelete(bonus)}
                      className="text-text-secondary hover:text-rose-500 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingEntry ? 'Editar Registro' : 'Adicionar Registro'}
      >
        {error && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {!editingEntry && (
            <Select
              label="Colaborador"
              required
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="Projeto"
            required
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          >
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input
            label="Início"
            type="datetime-local"
            required
            value={form.started_at}
            onChange={(e) => setForm({ ...form, started_at: e.target.value })}
          />
          <Input
            label="Saída"
            type="datetime-local"
            required
            value={form.ended_at}
            onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
          />
          <Button type="submit" className="w-full">
            {editingEntry ? 'Salvar' : 'Adicionar Registro'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={showBonusForm}
        onClose={closeBonusForm}
        title={editingBonus ? 'Editar Bônus' : 'Adicionar Bônus'}
      >
        {bonusError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {bonusError}
          </div>
        )}
        <form onSubmit={handleBonusSubmit} className="space-y-3">
          <Select
            label="Colaborador"
            required
            value={bonusForm.user_id}
            onChange={(e) => setBonusForm({ ...bonusForm, user_id: e.target.value })}
          >
            <option value="">Selecione...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Input
            label="Título"
            required
            placeholder="Ex: Bônus por meta atingida"
            value={bonusForm.title}
            onChange={(e) => setBonusForm({ ...bonusForm, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor (R$)"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={bonusForm.amount}
              onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })}
            />
            <Input
              label="Data do bônus"
              type="date"
              required
              value={bonusForm.bonus_date}
              onChange={(e) => setBonusForm({ ...bonusForm, bonus_date: e.target.value })}
            />
          </div>
          <Input
            label="Descrição (opcional)"
            as="textarea"
            rows={3}
            className="!min-h-20"
            value={bonusForm.description}
            onChange={(e) => setBonusForm({ ...bonusForm, description: e.target.value })}
          />
          <Button type="submit" disabled={bonusSubmitting} className="w-full">
            {bonusSubmitting ? 'Salvando...' : editingBonus ? 'Salvar' : 'Criar Bônus'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(selectedPauses)}
        onClose={() => setSelectedPauses(null)}
        title="Pausas"
        size="lg"
      >
        <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg overflow-hidden">
          {selectedPauses?.map((pause, index) => (
            <div
              key={pause.id || index}
              className="grid grid-cols-3 gap-3 px-4 py-3 text-sm text-text-primary"
            >
              <span className="text-text-secondary">Pausa {index + 1}</span>
              <span className="tabular-nums">{formatTime(pause.paused_at)}</span>
              <span className="tabular-nums">
                {pause.resumed_at ? formatTime(pause.resumed_at) : 'Aberta'}
              </span>
            </div>
          ))}
        </div>
      </Modal>

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt whitespace-nowrap">
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Data
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Colaborador
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Projeto
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Início
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Pausas
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Saída
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Total
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Total/Dia
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Saldo
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Editado
              </th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Status
              </th>
              <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : tableEntries.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-10 text-text-secondary">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              tableEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors align-top"
                >
                  <td className="px-3 py-3 whitespace-nowrap text-text-primary">
                    {formatDate(entry.started_at)}
                  </td>
                  <td className="px-3 py-3 min-w-40">
                    <p className="font-medium text-text-primary">
                      {entry.profile?.name || '-'}
                    </p>
                    {entry.profile?.position && (
                      <p className="text-[11px] text-text-secondary">{entry.profile.position}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-48 text-text-primary">
                    {entry.project?.name || '-'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-text-primary">
                    {formatTime(entry.started_at)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {entry.pauses?.length ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPauses(entry.pauses)}
                        className="text-accent underline hover:opacity-80"
                      >
                        Visualizar ({entry.pauses.length})
                      </button>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-text-primary">
                    {formatTime(entry.ended_at)}
                    {entry.ended_at && !isSameLocalDate(entry.started_at, entry.ended_at) && (
                      <span className="ml-1 text-[10px] text-text-secondary">
                        ({formatDate(entry.ended_at)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium tabular-nums text-text-primary">
                    {formatDuration(entry.duration_minutes)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums text-text-secondary">
                    {entry.dailyTotalMinutes === null
                      ? ''
                      : formatDuration(entry.dailyTotalMinutes)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium tabular-nums text-text-primary">
                    {formatCurrency(entry.cost_snapshot)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-text-secondary">
                    {entry.edited_at ? 'Sim' : 'Não'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge
                      tone={
                        entry.status === 'completed'
                          ? 'success'
                          : entry.status === 'running'
                            ? 'info'
                            : entry.status === 'paused'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {statusLabel(entry.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(entry)}
                      className="text-text-secondary hover:text-text-primary mr-2 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-text-secondary hover:text-rose-500 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadEntries(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            Anterior
          </Button>
          <span className="px-3 py-1 text-sm text-text-secondary">
            {pagination.page} de {pagination.pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadEntries(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
          >
            Próximo
          </Button>
        </div>
      )}
    </div>
  )
}
