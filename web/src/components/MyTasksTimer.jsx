import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Timer } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from './ui/Card'
import { LiveDot } from './LiveDot'

function formatTotal(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return h === 0 ? `${m}min` : `${h}h${String(m).padStart(2, '0')}`
}

const PRIORITY = {
  high: { label: 'Alta', cls: 'state-danger' },
  medium: { label: 'Média', cls: 'state-attention' },
  low: { label: 'Baixa', cls: 'text-text-secondary' },
}

// Minhas tarefas no dashboard: lista clicável. O cronômetro fica no quadro do
// projeto — aqui é atalho + indício de apontamento em curso.
export function MyTasksTimer() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    try {
      setTasks(await api.get('/me/tasks'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border-subtle">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]">
            <Timer size={15} />
          </span>
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary truncate">
            Minhas tarefas
          </h2>
          {tasks.length > 0 && (
            <span className="text-[10px] font-medium tabular-nums text-text-secondary bg-surface-alt px-1.5 py-0.5">
              {tasks.length}
            </span>
          )}
        </div>
        <Link
          to="/project-board"
          className="text-xs text-text-secondary hover:text-[color:var(--color-accent)] underline transition-colors"
        >
          Ver board
        </Link>
      </div>

      {error && (
        <div className="mx-5 mt-3 state-danger-soft text-sm p-3">
          {error}
        </div>
      )}

      <div className="divide-y divide-border-subtle">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-8">Carregando...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-8">
            Nenhuma tarefa atribuída a você.{' '}
            <Link to="/project-board" className="text-[color:var(--color-accent)] hover:underline">
              Ver board
            </Link>
          </p>
        ) : (
          tasks.map((t) => {
            const isRunning = Boolean(t.open_started_at)
            const prio = PRIORITY[t.priority]
            return (
              <Link
                key={t.id}
                to={`/project-board?project=${t.project_id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-alt transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
                    <span className="truncate">{t.title}</span>
                    {isRunning && <LiveDot />}
                  </p>
                  <p className="text-xs text-text-secondary truncate">
                    {t.project_name}
                    {prio && (
                      <>
                        {' · '}
                        <span className={prio.cls}>{prio.label}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm tabular-nums ${
                      isRunning ? 'text-[color:var(--color-accent)] font-medium' : 'text-text-primary'
                    }`}
                  >
                    {formatTotal(t.my_minutes)}
                  </p>
                  {isRunning && (
                    <p className="text-[10px] text-[color:var(--color-accent)] uppercase tracking-wide">em curso</p>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-text-secondary shrink-0 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            )
          })
        )}
      </div>
    </Card>
  )
}
