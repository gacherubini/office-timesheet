import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Play, Pause, Square, RotateCcw, Eye, EyeOff,
  Coffee, Clock, Repeat,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BirthdayCalendar } from '../components/BirthdayCalendar'

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatHours(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-lg border p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export function EmployeeDashboardPage() {
  const { profile } = useAuth()

  // ── Stats ────────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [showCost, setShowCost] = useState(false)

  // ── Timer ────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [currentEntry, setCurrentEntry] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [timerLoading, setTimerLoading] = useState(false)
  const [timerError, setTimerError] = useState('')
  const intervalRef = useRef(null)

  function loadStats() {
    setStatsLoading(true)
    api.get('/me/stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }

  useEffect(() => {
    loadStats()
    api.get('/projects').then((data) => {
      setProjects(data.filter((p) => p.status === 'active'))
    })
    api.get('/me/history?limit=1').then((res) => {
      const entry = res.data?.[0]
      if (entry && (entry.status === 'running' || entry.status === 'paused')) {
        setCurrentEntry({
          id: entry.id,
          status: entry.status,
          started_at: entry.started_at,
          project_name: entry.projects?.name || 'Projeto',
          project_id: entry.projects?.id || null,
        })
      }
    })
  }, [])

  // Timer visual
  useEffect(() => {
    if (currentEntry?.status === 'running') {
      const start = new Date(currentEntry.started_at).getTime()
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [currentEntry?.status, currentEntry?.started_at])

  async function handleStart() {
    if (!selectedProject) { setTimerError('Selecione um projeto.'); return }
    setTimerError('')
    setTimerLoading(true)
    try {
      const entry = await api.post('/time-entries/start', { projectId: selectedProject })
      const proj = projects.find((p) => p.id === selectedProject)
      setCurrentEntry({ id: entry.id, status: 'running', started_at: entry.started_at, project_name: proj?.name || 'Projeto', project_id: selectedProject })
      setElapsed(0)
    } catch (err) { setTimerError(err.message) }
    finally { setTimerLoading(false) }
  }

  async function handlePause() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/pause')
      setCurrentEntry((prev) => ({ ...prev, status: 'paused' }))
    } catch (err) { setTimerError(err.message) }
    finally { setTimerLoading(false) }
  }

  async function handleResume() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/resume')
      setCurrentEntry((prev) => ({ ...prev, status: 'running' }))
    } catch (err) { setTimerError(err.message) }
    finally { setTimerLoading(false) }
  }

  async function handleStop() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/stop')
      setCurrentEntry(null)
      setElapsed(0)
      loadStats()
    } catch (err) { setTimerError(err.message) }
    finally { setTimerLoading(false) }
  }

  function handleTrocar() {
    handleStop()
    setSelectedProject('')
  }

  const isIdle = !currentEntry
  const isRunning = currentEntry?.status === 'running'
  const isPaused = currentEntry?.status === 'paused'

  const goalPct = stats?.goal_minutes > 0
    ? Math.min(100, Math.round((stats.total_minutes / stats.goal_minutes) * 100))
    : 0

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Início</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Coluna principal ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-5">

          {/* Card de perfil + timer */}
          <div className="bg-white rounded-lg border p-5 flex items-center gap-4">
            <Avatar name={profile?.name} url={profile?.avatar_url} size={56} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{profile?.name}</p>
              {profile?.position && <p className="text-sm text-gray-400 truncate">{profile.position}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-mono font-bold tabular-nums text-gray-900">{formatTime(elapsed)}</p>
              {isRunning && <span className="text-xs text-green-600 font-medium">Em andamento</span>}
              {isPaused && <span className="text-xs text-yellow-600 font-medium">Pausado</span>}
              {isIdle && <span className="text-xs text-gray-400">Aguardando</span>}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Horas (Mês)"
              value={statsLoading ? '...' : formatHours(stats?.total_minutes ?? 0)}
            />
            <KpiCard
              label="Média Horas/Dia"
              value={statsLoading ? '...' : formatHours(stats?.avg_minutes_per_day ?? 0)}
            />
            <KpiCard
              label="Projetos (Mês)"
              value={statsLoading ? '...' : String(stats?.project_count ?? 0)}
            />
            <div className="bg-white rounded-lg border p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Recebido (Mês)</span>
                <button onClick={() => setShowCost((v) => !v)} className="text-gray-400 hover:text-gray-600">
                  {showCost ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-xl font-bold text-gray-900 truncate">
                {statsLoading ? '...' : showCost ? formatCurrency(stats?.total_cost) : 'R$ ••••••'}
              </p>
            </div>
            <KpiCard
              label="Meta (Mês)"
              value={statsLoading ? '...' : `${goalPct}%`}
              sub={statsLoading ? '' : `${stats?.business_days_in_month ?? 0} dias úteis`}
            />
            <KpiCard
              label="Dias (Mês)"
              value={statsLoading ? '...' : String(stats?.working_days ?? 0)}
            />
          </div>

          {/* Tabela de Horas por Projeto */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Registro de Horas por Projeto</h2>
            </div>
            <div className="divide-y">
              {(stats?.project_breakdown ?? []).length === 0 && !statsLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum apontamento este mês.</p>
              ) : statsLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
              ) : (
                stats.project_breakdown.map((proj) => {
                  const isCurrent = currentEntry?.project_id === proj.project_id
                  return (
                    <div key={proj.project_id} className="flex items-center gap-3 px-5 py-3">
                      {proj.project_image ? (
                        <img src={proj.project_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{proj.project_name}</p>
                        {isCurrent && (
                          <span className="text-xs text-green-600 font-medium">
                            {isRunning ? '● Sessão atual' : isPaused ? '⏸ Pausado' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0 text-sm text-gray-600">
                        <p className="font-medium">{formatHours(proj.total_minutes)}</p>
                        <p className="text-xs text-gray-400">Hoje: {formatHours(proj.today_minutes)}</p>
                      </div>
                      <Link
                        to="/history"
                        className="text-xs text-gray-400 hover:text-gray-700 underline ml-2 shrink-0"
                      >
                        Ver
                      </Link>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Timer + Controles */}
          <div className="bg-white rounded-lg border p-5">
            {timerError && (
              <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{timerError}</div>
            )}

            {/* Seletor de projeto (idle) */}
            {isIdle && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecionar Projeto</label>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProject(p.id)}
                      className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        selectedProject === p.id
                          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.client && <p className="text-xs text-gray-400 truncate">{p.client}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Projeto atual */}
            {!isIdle && currentEntry?.project_name && (
              <p className="text-sm text-gray-500 mb-3 text-center">
                Projeto: <span className="font-medium text-gray-900">{currentEntry.project_name}</span>
              </p>
            )}

            {/* Botões de ação */}
            <div className="flex flex-wrap gap-2 justify-center">
              {isIdle && (
                <button
                  onClick={handleStart}
                  disabled={timerLoading || !selectedProject}
                  className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Play size={16} />
                  Iniciar
                </button>
              )}

              {isRunning && (
                <>
                  <button
                    onClick={handlePause}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
                  >
                    <Pause size={16} />
                    Volto Logo
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
                  >
                    <Coffee size={16} />
                    Café
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
                  >
                    <Clock size={16} />
                    Almoço
                  </button>
                  <button
                    onClick={handleTrocar}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Repeat size={16} />
                    Trocar
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <Square size={16} />
                    Encerrar
                  </button>
                </>
              )}

              {isPaused && (
                <>
                  <button
                    onClick={handleResume}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                    Retomar
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={timerLoading}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <Square size={16} />
                    Encerrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Coluna lateral ───────────────────────────────────────── */}
        <div className="lg:w-72 flex flex-col gap-5">

          {/* Calendário de aniversariantes */}
          <BirthdayCalendar />
        </div>
      </div>
    </div>
  )
}
