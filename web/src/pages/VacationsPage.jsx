import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarOff, CheckCircle2, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
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

export function VacationsPage() {
  const { canAutoApproveOwnVacationRequest } = useAuth()
  const [vacations, setVacations] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [vacationToDelete, setVacationToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
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

  function resetForm() {
    setForm({
      start_date: todayValue(),
      end_date: addDaysValue(todayValue(), 6),
      reason: '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      await api.post('/me/vacation-requests', form)
      resetForm()
      setSuccess(canAutoApproveOwnVacationRequest ? 'Férias aprovadas automaticamente.' : 'Solicitação de férias enviada para aprovação.')
      await loadVacations()
    } catch (err) {
      setError(err.message)
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
        <div className="bg-rose-500/10 text-rose-600 text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
        <Card>
          <h2 className="font-display text-lg text-text-primary mb-4">Nova solicitação</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
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
        </Card>

        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-alt">
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-text-secondary">
                  Período
                </th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-text-secondary">
                  Dias
                </th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-text-secondary">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-text-secondary">
                  Motivo
                </th>
                <th className="text-right px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-text-secondary">
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
              ) : vacations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-text-secondary">
                    Nenhuma solicitação de férias enviada.
                  </td>
                </tr>
              ) : (
                vacations.map((vacation) => (
                  <tr
                    key={vacation.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-text-primary">
                      {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium tabular-nums text-text-primary">
                      {formatDays(vacation.days_count)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={STATUS_TONE[vacation.status] || 'neutral'}>
                        {STATUS_LABEL[vacation.status] || vacation.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 min-w-52">
                      {vacation.reason ? (
                        <p className="text-text-primary line-clamp-2">{vacation.reason}</p>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                      {vacation.admin_note && (
                        <p className="text-xs text-text-secondary mt-1">
                          Admin: {vacation.admin_note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setVacationToDelete(vacation)}
                        disabled={deletingId === vacation.id}
                        className="inline-flex items-center justify-center gap-1.5 border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60 transition-colors"
                      >
                        <Trash2 size={13} />
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

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
          <div className="bg-rose-500/15 p-4 mb-4">
            <AlertTriangle className="text-rose-500" size={36} />
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
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Esta ação remove a solicitação.
          </p>
          <p className="text-text-secondary">
            Se precisar desse período novamente, será necessário criar um novo pedido.
          </p>
        </div>
        {deleteError && (
          <div className="bg-rose-500/10 text-rose-600 text-sm p-3 mt-3">
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
          <div className="bg-emerald-500/15 p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </div>
  )
}
