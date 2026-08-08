import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { ChevronRight } from 'lucide-react'
import { BirthdayCalendar } from '../components/BirthdayCalendar'
import { AgendaCard } from '../components/AgendaCard'
import { MyTasksTimer } from '../components/MyTasksTimer'
import { LiveDot } from '../components/LiveDot'
import { Card } from '../components/ui/Card'
import { BrandLine } from '../components/BrandLine'
import { useAuth } from '../contexts/AuthContext'

function formatClock(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatHM(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

function SectionCard({ title, count, action, children }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border-subtle">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-[9px] uppercase tracking-[.2em] text-text-secondary truncate">
            {title}
          </h2>
          {count != null && (
            <span className="text-[10px] font-medium tabular-nums text-text-secondary bg-surface-alt px-1.5 py-0.5">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

export function EmployeeDashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [active, setActive] = useState(null) // { project_id, paused } | null

  function loadStats() {
    setStatsLoading(true)
    api.get('/me/stats').then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }

  function loadActive() {
    api.get('/me/active-timer').then(setActive).catch(() => setActive(null))
  }

  useEffect(() => {
    loadStats()
    api.get('/projects').then((data) => setProjects(data.filter((p) => p.status === 'active')))
    loadActive()
    const poll = setInterval(loadActive, 20000)
    return () => clearInterval(poll)
  }, [])

  const firstName = (profile?.name || '').trim().split(' ')[0] || 'Bem-vindo'
  const activeProjectId = active?.project_id ?? null
  const activePaused = Boolean(active?.paused && active?.paused_at)

  const breakdown = stats?.project_breakdown ?? []
  const monthTotal = breakdown.reduce((s, p) => s + (p.total_minutes || 0), 0)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="font-display text-4xl font-light leading-tight">
          Olá, <span className="font-serif-em">{firstName}</span>
        </h1>
      </div>

      {/* Bloco herói: horas e projetos do mês */}
      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-8 overflow-hidden bg-brown px-6 py-6 text-white">
        <BrandLine x1={6} y1={112} x2={94} y2={-12} opacity={0.34} />
        <div className="relative z-10">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Horas no mês</p>
          <p className="mt-2 font-display text-5xl font-light leading-none tabular-nums">
            {statsLoading ? '—' : formatHM(stats?.total_minutes ?? 0)}
          </p>
        </div>
        <div className="relative z-10 pb-1">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Projetos</p>
          <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
            {statsLoading ? '—' : (stats?.project_count ?? 0)}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 flex flex-col gap-5">
          {/* Registro de horas por projeto */}
          <SectionCard title="Registro de horas por projeto">
            <div className="divide-y divide-border-subtle">
              {breakdown.length === 0 && !statsLoading ? (
                <p className="text-sm text-text-secondary text-center py-8">Nenhum apontamento este mês.</p>
              ) : statsLoading ? (
                <p className="text-sm text-text-secondary text-center py-8">Carregando...</p>
              ) : (
                breakdown.map((proj) => {
                  const isActive = proj.project_id === activeProjectId
                  const pct = monthTotal > 0 ? Math.round(((proj.total_minutes || 0) / monthTotal) * 100) : 0
                  return (
                    <div key={proj.project_id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-surface-alt/60 transition-colors">
                      {proj.project_image ? (
                        <img src={proj.project_image} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 bg-surface-alt flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
                          <span className="truncate">{proj.project_name}</span>
                          {isActive && <LiveDot paused={activePaused} />}
                        </p>
                        <p className="text-xs text-text-secondary tabular-nums">Hoje: {formatClock(proj.today_minutes)}</p>
                      </div>
                      <div className="text-right shrink-0 w-24">
                        <p className="text-sm font-medium text-text-primary tabular-nums">{formatClock(proj.total_minutes)}</p>
                        <div className="mt-1.5 h-1 bg-surface-alt overflow-hidden">
                          <div className="h-full" style={{ width: `${pct}%`, background: 'var(--color-brown)' }} />
                        </div>
                      </div>
                      <Link
                        to="/history"
                        className="text-xs text-text-secondary hover:text-[color:var(--color-accent)] underline ml-1 shrink-0 transition-colors"
                      >
                        Ver
                      </Link>
                    </div>
                  )
                })
              )}
            </div>
          </SectionCard>

          <MyTasksTimer activeProjectId={activeProjectId} activePaused={activePaused} />

          {/* Projetos */}
          <SectionCard
            title="Projetos"
            count={projects.length || null}
            action={
              <Link to="/project-board" className="text-xs text-text-secondary hover:text-[color:var(--color-accent)] underline transition-colors">
                Ver projetos
              </Link>
            }
          >
            <div className="divide-y divide-border-subtle">
              {projects.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-8">Nenhum projeto ativo.</p>
              ) : (
                projects.map((p) => {
                  const isActive = p.id === activeProjectId
                  return (
                    <Link
                      key={p.id}
                      to="/project-board"
                      className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-surface-alt transition-colors group"
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 bg-surface-alt flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
                          <span className="truncate">{p.name}</span>
                          {isActive && <LiveDot paused={activePaused} />}
                        </p>
                        {p.client && <p className="text-xs text-text-secondary truncate">{p.client}</p>}
                      </div>
                      <ChevronRight size={16} className="text-text-secondary shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )
                })
              )}
            </div>
          </SectionCard>
        </div>

        <div className="lg:w-72 flex flex-col gap-5">
          <AgendaCard />
          <BirthdayCalendar />
        </div>
      </div>
    </div>
  )
}
