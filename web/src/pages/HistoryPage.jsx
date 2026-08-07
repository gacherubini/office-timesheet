import { useEffect, useMemo, useState } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import { DateRange } from '../components/ui/DateRange'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { CheckCircle2 } from 'lucide-react'

registerLocale('pt-BR', ptBR)

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(minutes) {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

function formatHours(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${h}h ${String(m).padStart(2, '0')}min`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_TONE = {
  completed: 'success',
  running: 'info',
  paused: 'warning',
}

const STATUS_LABEL = {
  completed: 'Concluído',
  running: 'Em andamento',
  paused: 'Pausado',
}

const REQUEST_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const REQUEST_LABEL = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
}

export function HistoryPage() {
  const { isAdministrativeIntern } = useAuth()
  const showEarnings = !isAdministrativeIntern
  const [entries, setEntries] = useState([])
  const [earnings, setEarnings] = useState([])
  const [earningsLoading, setEarningsLoading] = useState(false)
  const [range, setRange] = useState({ from: '', to: '' })
  const [projects, setProjects] = useState([])
  const [requests, setRequests] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [form, setForm] = useState({
    requested_project_id: '',
    requested_started_at: null,
    requested_ended_at: null,
    reason: '',
  })
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  const requestsByEntryId = useMemo(() => {
    return requests.reduce((acc, request) => {
      if (!acc[request.time_entry_id] || request.status === 'pending') {
        acc[request.time_entry_id] = request
      }
      return acc
    }, {})
  }, [requests])

  async function loadRequests() {
    const data = await api.get('/me/time-entry-change-requests')
    setRequests(data)
  }

  async function loadHistory(page = 1) {
    setLoading(true)
    setError('')
    try {
      const [historyRes, projectRes, requestRes] = await Promise.all([
        api.get(`/me/history?page=${page}&limit=15`),
        api.get('/projects'),
        api.get('/me/time-entry-change-requests'),
      ])
      setEntries(historyRes.data)
      setPagination(historyRes.pagination)
      setProjects(projectRes)
      setRequests(requestRes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadEarnings() {
    if (!showEarnings) return
    setEarningsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (range.from) qs.set('from', range.from)
      if (range.to) qs.set('to', range.to)
      const q = qs.toString()
      setEarnings(await api.get(`/me/project-earnings${q ? `?${q}` : ''}`))
    } catch (err) {
      console.error(err)
    } finally {
      setEarningsLoading(false)
    }
  }

  useEffect(() => {
    loadEarnings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to])

  const earningsTotal = useMemo(
    () => earnings.reduce(
      (acc, e) => ({
        minutes: acc.minutes + (e.total_minutes || 0),
        cost: acc.cost + Number(e.total_cost || 0),
      }),
      { minutes: 0, cost: 0 },
    ),
    [earnings],
  )

  function openRequestModal(entry) {
    setSelectedEntry(entry)
    setForm({
      requested_project_id: entry.project_id || '',
      requested_started_at: entry.started_at ? new Date(entry.started_at) : null,
      requested_ended_at: entry.ended_at ? new Date(entry.ended_at) : null,
      reason: '',
    })
    setFormError('')
    setSuccess('')
  }

  function closeRequestModal() {
    setSelectedEntry(null)
    setSubmitting(false)
    setFormError('')
    setForm({
      requested_project_id: '',
      requested_started_at: null,
      requested_ended_at: null,
      reason: '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedEntry) return

    setSubmitting(true)
    setFormError('')
    setSuccess('')

    if (!form.requested_started_at || !form.requested_ended_at) {
      setFormError('Informe início e saída.')
      setSubmitting(false)
      return
    }

    if (form.requested_ended_at <= form.requested_started_at) {
      setFormError('A saída deve ser posterior ao início.')
      setSubmitting(false)
      return
    }

    try {
      await api.post('/me/time-entry-change-requests', {
        time_entry_id: selectedEntry.id,
        requested_project_id: form.requested_project_id,
        requested_started_at: form.requested_started_at.toISOString(),
        requested_ended_at: form.requested_ended_at.toISOString(),
        reason: form.reason,
      })
      await loadRequests()
      setSuccess('Solicitação enviada para aprovação do administrador.')
      closeRequestModal()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Meu Histórico"
        subtitle="Apontamentos e solicitações de alteração"
      />

      {showEarnings && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DateRange
            size="sm"
            from={range.from}
            to={range.to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
            fromLabel=""
            toLabel=""
          />
          {(range.from || range.to) && (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setRange({ from: '', to: '' })}>
              Limpar
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      {showEarnings && (
        <Card padded={false} className="overflow-hidden mb-5">
          <div className="flex items-center gap-3 border-b border-border-subtle bg-bg px-5 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
            <span className="flex-1">Ganhos por projeto</span>
            <span className="w-28 flex-none text-right">Valor</span>
          </div>

          {earningsLoading ? (
            <p className="text-sm text-text-secondary text-center py-6">Carregando...</p>
          ) : earnings.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-6">
              Nenhum apontamento concluído no período.
            </p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {earnings.map((e) => (
                <div
                  key={e.project_id || 'none'}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[color:var(--color-hover)]"
                >
                  {e.project_image ? (
                    <img src={e.project_image} alt="" className="w-9 h-9 object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-surface-alt flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {e.project_name || 'Sem projeto'}
                    </p>
                    <p className="text-xs text-text-secondary">{e.entry_count} apontamento(s)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-text-primary tabular-nums">
                      {formatCurrency(e.total_cost)}
                    </p>
                    <p className="text-xs text-text-secondary tabular-nums">{formatHours(e.total_minutes)}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 px-5 py-3 bg-surface-alt/50">
                <p className="flex-1 text-[10px] uppercase tracking-[.2em] text-text-secondary">Total</p>
                <div className="text-right shrink-0">
                  <p className="text-base font-medium text-text-primary tabular-nums">
                    {formatCurrency(earningsTotal.cost)}
                  </p>
                  <p className="text-xs text-text-secondary tabular-nums">{formatHours(earningsTotal.minutes)}</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-bg">
              <th className="text-left px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Data
              </th>
              <th className="text-left px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Projeto
              </th>
              <th className="text-right px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Início
              </th>
              <th className="text-right px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Saída
              </th>
              <th className="text-right px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Duração
              </th>
              <th className="text-left px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Status
              </th>
              <th className="text-left px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Solicitação
              </th>
              <th className="text-right px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-text-secondary">
                  Nenhum apontamento encontrado.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const request = requestsByEntryId[entry.id]
                const hasPendingRequest = request?.status === 'pending'
                const canRequest = entry.status === 'completed' && !hasPendingRequest

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border-subtle last:border-b-0 even:bg-surface-alt/40 hover:bg-[color:var(--color-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-text-primary">
                      {formatDate(entry.started_at)}
                    </td>
                    <td className="px-4 py-3 min-w-40 text-text-primary">
                      {entry.projects?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-text-primary">
                      {formatTime(entry.started_at)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-text-primary">
                      {formatTime(entry.ended_at)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-text-primary">
                      {formatDuration(entry.duration_minutes)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={STATUS_TONE[entry.status] || 'neutral'}>
                        {STATUS_LABEL[entry.status] || entry.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {request ? (
                        <Badge tone={REQUEST_TONE[request.status] || 'neutral'}>
                          {REQUEST_LABEL[request.status] || request.status}
                        </Badge>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openRequestModal(entry)}
                        disabled={!canRequest}
                      >
                        Solicitar alteração
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadHistory(pagination.page - 1)}
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
            onClick={() => loadHistory(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
          >
            Próximo
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(selectedEntry)}
        onClose={closeRequestModal}
        title="Solicitar alteração de ponto"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeRequestModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </>
        }
      >
        {selectedEntry && (
          <p className="text-sm text-text-secondary mb-4">
            {formatDate(selectedEntry.started_at)} ·{' '}
            {selectedEntry.projects?.name || 'Sem projeto'}
          </p>
        )}
        {formError && (
          <div className="state-danger-soft text-sm p-3 mb-4">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Select
            label="Projeto correto"
            value={form.requested_project_id}
            onChange={(e) => setForm((prev) => ({ ...prev, requested_project_id: e.target.value }))}
            required
          >
            <option value="">Selecione um projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Início</label>
              <DatePicker
                selected={form.requested_started_at}
                onChange={(date) => setForm((prev) => ({ ...prev, requested_started_at: date }))}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={1}
                dateFormat="dd/MM/yyyy HH:mm"
                locale="pt-BR"
                placeholderText="DD/MM/AAAA HH:MM"
                required
                wrapperClassName="block w-full"
                className="w-full form-control border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Saída</label>
              <DatePicker
                selected={form.requested_ended_at}
                onChange={(date) => setForm((prev) => ({ ...prev, requested_ended_at: date }))}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={1}
                dateFormat="dd/MM/yyyy HH:mm"
                locale="pt-BR"
                placeholderText="DD/MM/AAAA HH:MM"
                required
                wrapperClassName="block w-full"
                className="w-full form-control border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          <Input
            label="Motivo"
            as="textarea"
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            className="!min-h-24"
            rows={4}
            required
          />
        </form>
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
