import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarOff, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { DateRange } from '../components/ui/DateRange'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'

function todayValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysValue(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
}

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const STATUS_LABEL = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
}

const STATUS_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'rejected', label: 'Recusadas' },
  { key: 'cancelled', label: 'Canceladas' },
]

function StatusChip({ active, label, count, onClick }) {
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

export function VacationsPage() {
  const { canAutoApproveOwnVacationRequest } = useAuth()
  const [vacations, setVacations] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [vacationToDelete, setVacationToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [error, setError] = useState('')
  const [createError, setCreateError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [form, setForm] = useState({
    start_date: todayValue(),
    end_date: addDaysValue(todayValue(), 6),
    reason: '',
  })

  const daysHint = useMemo(
    () => calculateDays(form.start_date, form.end_date),
    [form.start_date, form.end_date],
  )

  async function loadVacations() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/me/vacation-requests')
      setVacations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVacations()
  }, [])

  const statusCounts = useMemo(() => {
    const counts = { all: vacations.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 }
    for (const vacation of vacations) {
      if (counts[vacation.status] !== undefined) counts[vacation.status] += 1
    }
    return counts
  }, [vacations])

  const filteredVacations = useMemo(() => {
    return vacations.filter((vacation) => {
      if (statusFilter !== 'all' && vacation.status !== statusFilter) return false
      if (dateRange.from && vacation.start_date < dateRange.from) return false
      if (dateRange.to && vacation.start_date > dateRange.to) return false
      return true
    })
  }, [vacations, statusFilter, dateRange])

  function resetForm() {
    setForm({
      start_date: todayValue(),
      end_date: addDaysValue(todayValue(), 6),
      reason: '',
    })
  }

  function openCreate() {
    resetForm()
    setCreateError('')
    setShowCreateForm(true)
  }

  function closeCreate() {
    if (submitting) return
    setShowCreateForm(false)
    setCreateError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setCreateError('')
    setSuccess('')

    try {
      await api.post('/me/vacation-requests', form)
      resetForm()
      setShowCreateForm(false)
      setSuccess(canAutoApproveOwnVacationRequest ? 'Férias aprovadas automaticamente.' : 'Solicitação de férias enviada para aprovação.')
      await loadVacations()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function closeDeleteModal() {
    if (deletingId) return
    setVacationToDelete(null)
    setDeleteError('')
  }

  async function deleteVacation() {
    if (!vacationToDelete) return

    setDeletingId(vacationToDelete.id)
    setDeleteError('')
    setError('')

    try {
      await api.delete(`/me/vacation-requests/${vacationToDelete.id}`)
      setVacationToDelete(null)
      setSuccess('Solicitação de férias apagada.')
      await loadVacations()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Férias"
        subtitle="Solicite períodos de descanso para aprovação"
      />

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        {STATUS_FILTERS.map((f) => (
          <StatusChip
            key={f.key}
            active={statusFilter === f.key}
            label={f.label}
            count={statusCounts[f.key] ?? 0}
            onClick={() => setStatusFilter(f.key)}
          />
        ))}

        <DateRange
          from={dateRange.from}
          to={dateRange.to}
          onFromChange={(value) => setDateRange((r) => ({ ...r, from: value }))}
          onToChange={(value) => setDateRange((r) => ({ ...r, to: value }))}
          fromLabel="Início"
          toLabel="Até"
        />

        <Button className="ml-auto h-8" onClick={openCreate}>
          <Plus size={15} /> Solicitar férias
        </Button>
      </div>

      <Card padded={false}>
        <div className="hidden sm:flex items-center gap-3 border-b border-border-subtle bg-bg px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
          <span className="w-44 flex-none">Período</span>
          <span className="w-20 flex-none">Dias</span>
          <span className="w-24 flex-none">Status</span>
          <span className="flex-1">Motivo</span>
          <span className="w-28 flex-none text-right">Ações</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Carregando...</p>
          ) : filteredVacations.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">
              Nenhuma solicitação de férias neste período.
            </p>
          ) : (
            filteredVacations.map((vacation) => (
              <div
                key={vacation.id}
                className="flex flex-col gap-1 px-4 py-2.5 transition-colors hover:bg-[color:var(--color-hover)] sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="text-[12.5px] text-text-primary sm:w-44 sm:flex-none">
                  {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                </span>
                <span className="text-[12.5px] font-medium tabular-nums text-text-primary sm:w-20 sm:flex-none">
                  {formatDays(vacation.days_count)}
                </span>
                <span className="sm:w-24 sm:flex-none">
                  <Badge tone={STATUS_TONE[vacation.status] || 'neutral'}>
                    {STATUS_LABEL[vacation.status] || vacation.status}
                  </Badge>
                </span>
                <div className="min-w-0 flex-1">
                  {vacation.reason ? (
                    <p className="text-[12.5px] text-text-primary line-clamp-2">{vacation.reason}</p>
                  ) : (
                    <span className="text-[12.5px] text-text-secondary">-</span>
                  )}
                  {vacation.admin_note && (
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      Admin: {vacation.admin_note}
                    </p>
                  )}
                </div>
                <span className="sm:w-28 sm:flex-none sm:text-right">
                  <button
                    type="button"
                    onClick={() => setVacationToDelete(vacation)}
                    disabled={deletingId === vacation.id}
                    className="inline-flex items-center justify-center gap-1.5 border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60 transition-colors"
                  >
                    <Trash2 size={13} />
                    Apagar
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
        title="Solicitar férias"
      >
        {createError && (
          <div className="state-danger-soft text-sm p-3 mb-4">
            {createError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Início"
              min={todayValue()}
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              required
            />

            <DateField
              label="Fim"
              min={form.start_date || todayValue()}
              value={form.end_date}
              onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              required
            />
          </div>

          <div className="flex items-center gap-2 bg-surface-alt px-3 py-2 text-sm text-text-secondary">
            <CalendarOff size={16} />
            <span>{daysHint > 0 ? formatDays(daysHint) : 'Selecione um período válido'}</span>
          </div>

          <Input
            label="Motivo"
            as="textarea"
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            rows={4}
            className="!min-h-24"
          />

          <Button type="submit" disabled={submitting || daysHint <= 0} className="w-full">
            {submitting ? 'Enviando...' : 'Enviar solicitação'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(vacationToDelete)}
        onClose={closeDeleteModal}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeDeleteModal} disabled={Boolean(deletingId)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={deleteVacation} disabled={Boolean(deletingId)}>
              {deletingId ? 'Apagando...' : 'Sim, apagar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="state-danger-soft p-4 mb-4">
            <AlertTriangle className="state-danger" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">
            Apagar férias?
          </h3>
          <p className="text-text-secondary">
            Você está prestes a apagar a solicitação de{' '}
            <strong className="text-text-primary">
              {formatDate(vacationToDelete?.start_date)} até {formatDate(vacationToDelete?.end_date)}
            </strong>
          </p>
        </div>
        <div className="state-danger-soft p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Esta ação remove a solicitação.
          </p>
          <p className="text-text-secondary">
            Se precisar desse período novamente, será necessário criar um novo pedido.
          </p>
        </div>
        {deleteError && (
          <div className="state-danger-soft text-sm p-3 mt-3">
            {deleteError}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess('')}
        size="sm"
        footer={
          <Button onClick={() => setSuccess('')}>OK</Button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="state-success-soft p-4 mb-4">
            <CheckCircle2 className="state-success" size={36} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </div>
  )
}
