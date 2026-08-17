import { useEffect, useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateBR as formatDate, todayInSaoPaulo } from '../../lib/dates'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Input'
import { DateField } from '../../components/ui/DateField'
import { DateRange } from '../../components/ui/DateRange'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/Avatar'

const EMPTY_BONUS_FORM = {
  user_id: '',
  title: '',
  description: '',
  amount: '',
  bonus_date: todayInSaoPaulo(),
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AdminManageBonusesPage() {
  const [bonuses, setBonuses] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({ user_id: '', start_date: '', end_date: '' })
  const [bonusToDelete, setBonusToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_BONUS_FORM)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    api.get('/admin/users').then(setUsers).catch(() => {})
  }, [])

  async function loadBonuses() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filters.user_id) params.set('user_id', filters.user_id)
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)
      const qs = params.toString()
      const data = await api.get(`/admin/bonuses${qs ? `?${qs}` : ''}`)
      setBonuses(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBonuses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.user_id, filters.start_date, filters.end_date])

  function openCreate() {
    setCreateForm(EMPTY_BONUS_FORM)
    setCreateError('')
    setShowCreateForm(true)
  }

  function closeCreate() {
    if (creating) return
    setShowCreateForm(false)
    setCreateError('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      await api.post('/admin/bonuses', {
        user_id: createForm.user_id,
        title: createForm.title,
        description: createForm.description || null,
        amount: Number(createForm.amount),
        bonus_date: createForm.bonus_date,
      })
      setShowCreateForm(false)
      setCreateForm(EMPTY_BONUS_FORM)
      setSuccessMessage('Bônus concedido com sucesso!')
      await loadBonuses()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleConfirmDelete() {
    if (!bonusToDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/admin/bonuses/${bonusToDelete.id}`)
      setBonusToDelete(null)
      setSuccessMessage('Bônus excluído com sucesso!')
      await loadBonuses()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Gerenciar Bônus"
        subtitle="Conceder e excluir bônus de colaboradores"
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Select
          className="w-56"
          size="sm"
          label="Colaborador"
          value={filters.user_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))}
        >
          <option value="">Toda a equipe</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>

        <DateRange
          size="sm"
          from={filters.start_date}
          to={filters.end_date}
          onFromChange={(value) => setFilters((prev) => ({ ...prev, start_date: value }))}
          onToChange={(value) => setFilters((prev) => ({ ...prev, end_date: value }))}
        />

        <Button className="ml-auto h-8" onClick={openCreate}>
          <Plus size={15} /> Novo bônus
        </Button>
      </div>

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false}>
        <div className="hidden sm:flex items-center gap-3 border-b border-border-subtle bg-bg px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
          <span className="w-20 flex-none">Data</span>
          <span className="w-48 flex-none">Colaborador</span>
          <span className="flex-1">Bônus</span>
          <span className="w-28 flex-none text-right">Valor</span>
          <span className="w-12 flex-none text-right">Ações</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Carregando...</p>
          ) : bonuses.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">
              Nenhum bônus encontrado.
            </p>
          ) : (
            bonuses.map((bonus) => (
              <div
                key={bonus.id}
                className="flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-[color:var(--color-hover)] sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="text-[12.5px] text-text-primary sm:w-20 sm:flex-none">
                  {formatDate(bonus.bonus_date)}
                </span>
                <div className="flex items-center gap-2 sm:w-48 sm:flex-none">
                  <Avatar name={bonus.profile?.name} url={bonus.profile?.avatar_url} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-text-primary">
                      {bonus.profile?.name || '-'}
                    </p>
                    {bonus.profile?.position && (
                      <p className="truncate text-[11px] text-text-secondary">
                        {bonus.profile.position}
                      </p>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-text-primary">{bonus.title}</p>
                  {bonus.description && (
                    <p className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">
                      {bonus.description}
                    </p>
                  )}
                </div>
                <span className="text-[12.5px] font-medium tabular-nums text-accent sm:w-28 sm:flex-none sm:text-right">
                  {formatCurrency(bonus.amount)}
                </span>
                <span className="sm:w-12 sm:flex-none sm:text-right">
                  <button
                    onClick={() => setBonusToDelete(bonus)}
                    className="text-text-secondary hover:text-state-danger transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal
        open={showCreateForm}
        onClose={closeCreate}
        title="Conceder Bônus"
      >
        {createError && (
          <div className="state-danger-soft text-sm p-3 mb-4">
            {createError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-3">
          <Select
            label="Colaborador"
            required
            value={createForm.user_id}
            onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
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
            value={createForm.title}
            onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor (R$)"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={createForm.amount}
              onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
            />
            <DateField
              label="Data do bônus"
              required
              value={createForm.bonus_date}
              onChange={(e) => setCreateForm({ ...createForm, bonus_date: e.target.value })}
            />
          </div>
          <Input
            label="Descrição (opcional)"
            as="textarea"
            rows={3}
            className="!min-h-20"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />
          <Button type="submit" disabled={creating} className="w-full">
            {creating ? 'Salvando...' : 'Conceder Bônus'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(bonusToDelete)}
        onClose={() => (deleting ? null : setBonusToDelete(null))}
        title="Excluir bônus"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setBonusToDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-primary">
          Tem certeza que deseja excluir este bônus? Esta ação não pode ser desfeita.
        </p>
        {bonusToDelete && (
          <div className="mt-3 border border-border-subtle bg-surface-alt px-3 py-2 text-sm">
            <p className="font-medium text-text-primary">{bonusToDelete.title}</p>
            <p className="text-xs text-text-secondary">
              {bonusToDelete.profile?.name || 'Colaborador'} · {formatDate(bonusToDelete.bonus_date)} · {formatCurrency(bonusToDelete.amount)}
            </p>
          </div>
        )}
      </Modal>

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
