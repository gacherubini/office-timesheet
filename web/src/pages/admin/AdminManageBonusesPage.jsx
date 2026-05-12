import { useEffect, useState } from 'react'
import { CheckCircle2, Gift, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/Avatar'

const EMPTY_BONUS_FORM = {
  user_id: '',
  title: '',
  description: '',
  amount: '',
  bonus_date: new Date().toISOString().slice(0, 10),
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return date.toLocaleDateString('pt-BR')
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
  }, [])

  function handleFilter(e) {
    e.preventDefault()
    loadBonuses()
  }

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
        actions={
          <Button onClick={openCreate}>
            <Gift size={16} />
            Conceder Bônus
          </Button>
        }
      />

      <Card className="mb-4">
        <form onSubmit={handleFilter} className="flex flex-col xl:flex-row xl:items-end gap-3">
          <Select
            className="xl:w-64"
            label="Colaborador"
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
      </Card>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Data</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Colaborador</th>
              <th className="text-left px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Bônus</th>
              <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Valor</th>
              <th className="text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : bonuses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-text-secondary">
                  Nenhum bônus encontrado.
                </td>
              </tr>
            ) : (
              bonuses.map((bonus) => (
                <tr
                  key={bonus.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                >
                  <td className="px-3 py-3 whitespace-nowrap text-text-primary">
                    {formatDate(bonus.bonus_date)}
                  </td>
                  <td className="px-3 py-3 min-w-40">
                    <div className="flex items-center gap-2">
                      <Avatar name={bonus.profile?.name} url={bonus.profile?.avatar_url} size={28} />
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {bonus.profile?.name || '-'}
                        </p>
                        {bonus.profile?.position && (
                          <p className="text-[11px] text-text-secondary truncate">
                            {bonus.profile.position}
                          </p>
                        )}
                      </div>
                    </div>
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
                      onClick={() => setBonusToDelete(bonus)}
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

      <Modal
        open={showCreateForm}
        onClose={closeCreate}
        title="Conceder Bônus"
      >
        {createError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
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
            <Input
              label="Data do bônus"
              type="date"
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
          <div className="mt-3 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2 text-sm">
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
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{successMessage}</p>
        </div>
      </Modal>
    </div>
  )
}
