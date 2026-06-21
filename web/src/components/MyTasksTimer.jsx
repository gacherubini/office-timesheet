import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from './ui/Card'

function formatTotal(minutes) {
  const h = Math.floor((minutes || 0) / 60)
  const m = Math.floor((minutes || 0) % 60)
  return h === 0 ? `${m}min` : `${h}h${String(m).padStart(2, '0')}`
}

const PRIORITY = {
  high: { label: 'Alta', cls: 'text-rose-500' },
  medium: { label: 'Média', cls: 'text-amber-500' },
  low: { label: 'Baixa', cls: 'text-text-secondary' },
}

// Minhas tarefas no dashboard: lista clicável. O cronômetro fica no quadro do
// projeto (card/detalhe) — aqui é só atalho pra chegar lá.
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
      <div className="px-5 py-3 border-b border-border-subtle bg-surface-alt flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Minhas tarefas
        </h2>
        <Link
          to="/project-board"
          className="text-xs text-text-secondary hover:text-text-primary underline transition-colors"
        >
          Ver board
        </Link>
      </div>

      {error && (
        <div className="mx-5 mt-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="divide-y divide-border-subtle">
        {loading ? (
          <p className="text-sm text-text-secondary text-center py-6">Carregando...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-6">
            Nenhuma tarefa atribuída a você.{' '}
            <Link to="/project-board" className="text-accent hover:underline">
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
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-alt transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
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
                  <p className={`text-sm tabular-nums ${isRunning ? 'text-emerald-500 font-medium' : 'text-text-primary'}`}>
                    {formatTotal(t.my_minutes)}
                  </p>
                  {isRunning && <p className="text-[10px] text-emerald-500">em andamento</p>}
                </div>
                <ChevronRight size={16} className="text-text-secondary shrink-0" />
              </Link>
            )
          })
        )}
      </div>
    </Card>
  )
}
