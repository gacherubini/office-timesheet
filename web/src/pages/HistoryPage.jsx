import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { CheckCircle2 } from 'lucide-react'

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

function toLocalParts(iso) {
  if (!iso) return { date: '', time: '' }
  const date = new Date(iso)
  const offsetMs = date.getTimezoneOffset() * 60000
  const local = new Date(date.getTime() - offsetMs).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}

function maskTime(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false
  const [h, m] = value.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
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
  const [entries, setEntries] = useState([])
  const [projects, setProjects] = useState([])
  const [requests, setRequests] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [form, setForm] = useState({
    requested_project_id: '',
    requested_date: '',
    requested_start_time: '',
    requested_end_time: '',
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

  function openRequestModal(entry) {
    const startParts = toLocalParts(entry.started_at)
    const endParts = toLocalParts(entry.ended_at)
    setSelectedEntry(entry)
    setForm({
      requested_project_id: entry.project_id || '',
      requested_date: startParts.date,
      requested_start_time: startParts.time,
      requested_end_time: endParts.time,
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
      requested_date: '',
      requested_start_time: '',
      requested_end_time: '',
      reason: '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedEntry) return

    setSubmitting(true)
    setFormError('')
    setSuccess('')

    if (!isValidTime(form.requested_start_time) || !isValidTime(form.requested_end_time)) {
      setFormError('Informe os horários no formato HH:MM (24h).')
      setSubmitting(false)
      return
    }

    try {
      const startedLocal = `${form.requested_date}T${form.requested_start_time}`
      let endedLocal = `${form.requested_date}T${form.requested_end_time}`
      if (form.requested_end_time < form.requested_start_time) {
        const next = new Date(`${form.requested_date}T00:00`)
        next.setDate(next.getDate() + 1)
        const nextDate = next.toISOString().slice(0, 10)
        endedLocal = `${nextDate}T${form.requested_end_time}`
      }
      // Converte horário local do browser pra ISO UTC explícito
      const startedAt = new Date(startedLocal).toISOString()
      const endedAt = new Date(endedLocal).toISOString()
      await api.post('/me/time-entry-change-requests', {
        time_entry_id: selectedEntry.id,
        requested_project_id: form.requested_project_id,
        requested_started_at: startedAt,
        requested_ended_at: endedAt,
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

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Data
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Projeto
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Início
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Saída
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Duração
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Status
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Solicitação
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
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
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-text-primary">
                      {formatDate(entry.started_at)}
                    </td>
                    <td className="px-4 py-3 min-w-40 text-text-primary">
                      {entry.projects?.name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-text-primary">
                      {formatTime(entry.started_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-text-primary">
                      {formatTime(entry.ended_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-text-primary">
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
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
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

          <Input
            label="Data"
            type="date"
            lang="pt-BR"
            value={form.requested_date}
            onChange={(e) => setForm((prev) => ({ ...prev, requested_date: e.target.value }))}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Início (hh:mm)"
              type="text"
              inputMode="numeric"
              placeholder="08:00"
              maxLength={5}
              value={form.requested_start_time}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, requested_start_time: maskTime(e.target.value) }))
              }
              required
            />
            <Input
              label="Saída (hh:mm)"
              type="text"
              inputMode="numeric"
              placeholder="17:00"
              maxLength={5}
              value={form.requested_end_time}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, requested_end_time: maskTime(e.target.value) }))
              }
              required
            />
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
          <div className="bg-emerald-500/15 rounded-full p-4 mb-4">
            <CheckCircle2 className="text-emerald-500" size={36} />
          </div>
          <p className="text-text-primary font-medium">{success}</p>
        </div>
      </Modal>
    </div>
  )
}
