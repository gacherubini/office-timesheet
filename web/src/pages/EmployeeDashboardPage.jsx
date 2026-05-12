import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Play, Pause, Square, RotateCcw, Eye, EyeOff, Coffee, Clock, Repeat } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BirthdayCalendar } from '../components/BirthdayCalendar'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatHours(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function KpiCard({ label, value, sub, action }) {
  return (
    <Card className="!p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-medium text-text-secondary">
          {label}
        </span>
        {action}
      </div>
      <p className="font-display text-2xl text-text-primary truncate">{value}</p>
      {sub && <p className="text-xs text-text-secondary">{sub}</p>}
    </Card>
  )
}

const TIMER_BTN =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50'

export function EmployeeDashboardPage() {
  const { profile } = useAuth()

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [showCost, setShowCost] = useState(false)

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [currentEntry, setCurrentEntry] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [timerLoading, setTimerLoading] = useState(false)
  const [timerError, setTimerError] = useState('')
  const intervalRef = useRef(null)

  function loadStats() {
    setStatsLoading(true)
    api
      .get('/me/stats')
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
    if (!selectedProject) {
      setTimerError('Selecione um projeto.')
      return
    }
    setTimerError('')
    setTimerLoading(true)
    try {
      const entry = await api.post('/time-entries/start', { project_id: selectedProject })
      const proj = projects.find((p) => p.id === selectedProject)
      setCurrentEntry({
        id: entry.id,
        status: 'running',
        started_at: entry.started_at,
        project_name: proj?.name || 'Projeto',
        project_id: selectedProject,
      })
      setElapsed(0)
    } catch (err) {
      setTimerError(err.message)
    } finally {
      setTimerLoading(false)
    }
  }

  async function handlePause() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/pause')
      setCurrentEntry((prev) => ({ ...prev, status: 'paused' }))
    } catch (err) {
      setTimerError(err.message)
    } finally {
      setTimerLoading(false)
    }
  }

  async function handleResume() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/resume')
      setCurrentEntry((prev) => ({ ...prev, status: 'running' }))
    } catch (err) {
      setTimerError(err.message)
    } finally {
      setTimerLoading(false)
    }
  }

  async function handleStop() {
    setTimerLoading(true)
    try {
      await api.post('/time-entries/stop')
      setCurrentEntry(null)
      setElapsed(0)
      loadStats()
    } catch (err) {
      setTimerError(err.message)
    } finally {
      setTimerLoading(false)
    }
  }

  function handleTrocar() {
    handleStop()
    setSelectedProject('')
  }

  const isIdle = !currentEntry
  const isRunning = currentEntry?.status === 'running'
  const isPaused = currentEntry?.status === 'paused'

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Início" subtitle="Sua produtividade e timer atual" />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 flex flex-col gap-5">
          <Card className="flex items-center gap-4">
            <Avatar name={profile?.name} url={profile?.avatar_url} size={56} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary truncate">{profile?.name}</p>
              {profile?.position && (
                <p className="text-sm text-text-secondary truncate">{profile.position}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-display text-3xl tabular-nums text-text-primary">
                {formatTime(elapsed)}
              </p>
              {isRunning && <span className="text-xs text-emerald-500 font-medium">Em andamento</span>}
              {isPaused && <span className="text-xs text-accent font-medium">Pausado</span>}
              {isIdle && <span className="text-xs text-text-secondary">Aguardando</span>}
            </div>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Horas (Mês)"
              value={statsLoading ? '—' : formatHours(stats?.total_minutes ?? 0)}
            />
            <KpiCard
              label="Média Horas/Dia"
              value={statsLoading ? '—' : formatHours(stats?.avg_minutes_per_day ?? 0)}
            />
            <KpiCard
              label="Projetos (Mês)"
              value={statsLoading ? '—' : String(stats?.project_count ?? 0)}
            />
            <KpiCard
              label="Recebido (Mês)"
              value={
                statsLoading
                  ? '—'
                  : showCost
                    ? formatCurrency(stats?.total_cost)
                    : 'R$ ••••••'
              }
              action={
                <button
                  onClick={() => setShowCost((v) => !v)}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  {showCost ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />
          </div>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-alt">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Registro de Horas por Projeto
              </h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {(stats?.project_breakdown ?? []).length === 0 && !statsLoading ? (
                <p className="text-sm text-text-secondary text-center py-6">
                  Nenhum apontamento este mês.
                </p>
              ) : statsLoading ? (
                <p className="text-sm text-text-secondary text-center py-6">Carregando...</p>
              ) : (
                stats.project_breakdown.map((proj) => {
                  const isCurrent = currentEntry?.project_id === proj.project_id
                  return (
                    <div key={proj.project_id} className="flex items-center gap-3 px-5 py-3">
                      {proj.project_image ? (
                        <img
                          src={proj.project_image}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-surface-alt flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {proj.project_name}
                        </p>
                        {isCurrent && (
                          <span className="text-xs text-emerald-500 font-medium">
                            {isRunning ? '● Sessão atual' : isPaused ? '⏸ Pausado' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0 text-sm text-text-primary">
                        <p className="font-medium tabular-nums">{formatHours(proj.total_minutes)}</p>
                        <p className="text-xs text-text-secondary tabular-nums">
                          Hoje: {formatHours(proj.today_minutes)}
                        </p>
                      </div>
                      <Link
                        to="/history"
                        className="text-xs text-text-secondary hover:text-text-primary underline ml-2 shrink-0 transition-colors"
                      >
                        Ver
                      </Link>
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            {timerError && (
              <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
                {timerError}
              </div>
            )}

            {isIdle && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Selecionar Projeto
                </label>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProject(p.id)}
                      className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        selectedProject === p.id
                          ? 'border-accent bg-[color:var(--color-accent)]/10'
                          : 'border-border-subtle hover:border-text-secondary'
                      }`}
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-surface-alt flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                        {p.client && (
                          <p className="text-xs text-text-secondary truncate">{p.client}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isIdle && currentEntry?.project_name && (
              <p className="text-sm text-text-secondary mb-3 text-center">
                Projeto:{' '}
                <span className="font-medium text-text-primary">{currentEntry.project_name}</span>
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              {isIdle && (
                <button
                  onClick={handleStart}
                  disabled={timerLoading || !selectedProject}
                  className={TIMER_BTN}
                  style={{ background: '#16a34a' }}
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
                    className={TIMER_BTN}
                    style={{ background: 'var(--color-accent)' }}
                  >
                    <Pause size={16} />
                    Volto Logo
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={timerLoading}
                    className={TIMER_BTN}
                    style={{ background: 'var(--color-accent)' }}
                  >
                    <Coffee size={16} />
                    Café
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={timerLoading}
                    className={TIMER_BTN}
                    style={{ background: 'var(--color-accent)' }}
                  >
                    <Clock size={16} />
                    Almoço
                  </button>
                  <button
                    onClick={handleTrocar}
                    disabled={timerLoading}
                    className={TIMER_BTN}
                    style={{ background: '#3D5C5C' }}
                  >
                    <Repeat size={16} />
                    Trocar
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={timerLoading}
                    className={TIMER_BTN}
                    style={{ background: '#dc2626' }}
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
                    className={TIMER_BTN}
                    style={{ background: '#16a34a' }}
                  >
                    <RotateCcw size={16} />
                    Retomar
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={timerLoading}
                    className={TIMER_BTN}
                    style={{ background: '#dc2626' }}
                  >
                    <Square size={16} />
                    Encerrar
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:w-72 flex flex-col gap-5">
          <BirthdayCalendar />
        </div>
      </div>
    </div>
  )
}
