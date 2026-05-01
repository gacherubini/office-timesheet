import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Check, Clock, FolderOpen, Users, X } from 'lucide-react'
import { BirthdayCalendar } from '../../components/BirthdayCalendar'
import { Avatar } from '../../components/Avatar'

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatHours(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  const s = 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function AdminDashboardPage() {
  const { start: defaultStart, end: defaultEnd } = getMonthRange()
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('team')
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [decidingId, setDecidingId] = useState(null)

  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true)
    setError('')
    api.get(`/admin/dashboard?start_date=${startDate}&end_date=${endDate}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  async function loadChangeRequests() {
    setRequestsLoading(true)
    try {
      const data = await api.get('/admin/time-entry-change-requests?status=pending')
      setRequests(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setRequestsLoading(false)
    }
  }

  useEffect(() => {
    loadChangeRequests()
  }, [])

  async function refreshDashboard() {
    if (!startDate || !endDate) return
    const nextData = await api.get(`/admin/dashboard?start_date=${startDate}&end_date=${endDate}`)
    setData(nextData)
  }

  async function approveRequest(requestId) {
    setDecidingId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/approve`, {})
      await Promise.all([loadChangeRequests(), refreshDashboard()])
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingId(null)
    }
  }

  async function rejectRequest(requestId) {
    const adminNote = window.prompt('Motivo da rejeição (opcional):')
    if (adminNote === null) return

    setDecidingId(requestId)
    setError('')
    try {
      await api.post(`/admin/time-entry-change-requests/${requestId}/reject`, { admin_note: adminNote })
      await loadChangeRequests()
    } catch (err) {
      setError(err.message)
    } finally {
      setDecidingId(null)
    }
  }

  const kpis = data?.kpis

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Início</h1>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-6">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Horas no Período"
          value={loading ? '...' : formatHours(kpis?.total_minutes ?? 0)}
          icon={Clock}
          color="bg-slate-500"
        />
        <KpiCard
          label="Usuários Ativos"
          value={loading ? '...' : `${kpis?.active_users ?? 0} de ${kpis?.total_users ?? 0}`}
          icon={Users}
          color="bg-slate-500"
        />
        <KpiCard
          label="Projetos Ativos"
          value={loading ? '...' : `${kpis?.active_projects ?? 0} de ${kpis?.total_projects ?? 0}`}
          icon={FolderOpen}
          color="bg-slate-500"
        />
      </div>

      {/* Tabs + Calendário de aniversariantes */}
      <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 bg-white rounded-lg shadow-sm border">
        <div className="flex border-b">
          {['team', 'projects'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'team' ? 'Equipe' : 'Projetos'}
            </button>
          ))}
        </div>

        <div className="divide-y">
          {loading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Carregando...</div>
          ) : tab === 'team' ? (
            (data?.team ?? []).length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Nenhum apontamento no período.</div>
            ) : (
              data.team.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} url={member.avatar_url} size={36} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.name}</p>
                      {member.position && (
                        <p className="text-xs text-gray-400">{member.position}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatHours(member.total_minutes)}</p>
                    <p className="text-xs text-gray-400">{member.project_count} {member.project_count === 1 ? 'Projeto' : 'Projetos'}</p>
                  </div>
                </div>
              ))
            )
          ) : (
            (data?.projects ?? []).length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Nenhum apontamento no período.</div>
            ) : (
              data.projects.map((project) => (
                <div key={project.project_id} className="flex items-center justify-between px-5 py-4">
                  <p className="text-sm font-medium text-gray-900">{project.name}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatHours(project.total_minutes)}</p>
                    <p className="text-xs text-gray-400">{project.member_count} {project.member_count === 1 ? 'Membro' : 'Membros'}</p>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* Coluna lateral: solicitações e aniversariantes */}
      <div className="lg:w-80 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-900">Solicitações</h2>
          </div>

          <div className="divide-y">
            {requestsLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
            ) : requests.length === 0 ? (
              <div className="py-8 px-5 text-center text-sm text-gray-400">
                Nenhuma solicitação pendente.
              </div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={request.profile?.name}
                      url={request.profile?.avatar_url}
                      size={34}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {request.profile?.name || 'Colaborador'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(request.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 space-y-1">
                    <p>
                      <span className="font-medium text-gray-700">Atual:</span>{' '}
                      {request.time_entry?.projects?.name || '-'} · {formatDateTime(request.time_entry?.started_at)}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Pedido:</span>{' '}
                      {request.requested_project?.name || '-'} · {formatDateTime(request.requested_started_at)}
                    </p>
                    <p className="line-clamp-3">{request.reason}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveRequest(request.id)}
                      disabled={decidingId === request.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      <Check size={14} />
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectRequest(request.id)}
                      disabled={decidingId === request.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                    >
                      <X size={14} />
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <BirthdayCalendar />
      </div>
      </div>
    </div>
  )
}
