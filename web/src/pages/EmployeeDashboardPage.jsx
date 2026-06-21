import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { ChevronRight } from 'lucide-react'
import { BirthdayCalendar } from '../components/BirthdayCalendar'
import { AgendaCard } from '../components/AgendaCard'
import { MyTasksTimer } from '../components/MyTasksTimer'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'

function formatHours(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export function EmployeeDashboardPage() {
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [projects, setProjects] = useState([])

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
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Início" subtitle="Sua produtividade e atalhos" />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 flex flex-col gap-5">
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
                stats.project_breakdown.map((proj) => (
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
                ))
              )}
            </div>
          </Card>

          <MyTasksTimer />

          {/* Projetos: escolha um projeto → vai pra aba Projetos. */}
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-alt flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Projetos
              </h2>
              <Link
                to="/project-board"
                className="text-xs text-text-secondary hover:text-text-primary underline transition-colors"
              >
                Ver projetos
              </Link>
            </div>
            <div className="divide-y divide-border-subtle">
              {projects.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-6">
                  Nenhum projeto ativo.
                </p>
              ) : (
                projects.map((p) => (
                  <Link
                    key={p.id}
                    to="/project-board"
                    className="flex items-center gap-3 px-5 py-3 hover:bg-surface-alt transition-colors"
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-surface-alt flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                      {p.client && <p className="text-xs text-text-secondary truncate">{p.client}</p>}
                    </div>
                    <ChevronRight size={16} className="text-text-secondary shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="lg:w-72 flex flex-col gap-5">
          <AgendaCard />
          <BirthdayCalendar />
        </div>
      </div>
    </div>
  )
}
