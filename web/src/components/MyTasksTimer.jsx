import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Square } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from './ui/Card'

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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

// Cronômetro por tarefa no dashboard: minhas tarefas ativas, com play/stop e
// contador ao vivo da que estiver rodando. Uma tarefa de cada vez — iniciar
// outra para a anterior automaticamente.
export function MyTasksTimer() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef(null)

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

  const running = tasks.find((t) => t.open_started_at)

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (running) {
      const start = new Date(running.open_started_at).getTime()
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
      tick()
      intervalRef.current = setInterval(tick, 1000)
    } else {
      setElapsed(0)
    }
    return () => clearInterval(intervalRef.current)
  }, [running?.id, running?.open_started_at])

  async function startTask(task) {
    setError('')
    setBusyId(task.id)
    try {
      if (running && running.id !== task.id) {
        await api.post(`/tasks/${running.id}/time/stop`, {})
      }
      await api.post(`/tasks/${task.id}/time/start`, {})
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function stopTask(task) {
    setError('')
    setBusyId(task.id)
    try {
      await api.post(`/tasks/${task.id}/time/stop`, {})
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

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
            const busy = busyId === t.id
            const prio = PRIORITY[t.priority]
            return (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/project-board?task=${t.id}`}
                    className="text-sm font-medium text-text-primary truncate block hover:underline"
                  >
                    {t.title}
                  </Link>
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
                      isRunning ? 'text-emerald-500 font-medium' : 'text-text-primary'
                    }`}
                  >
                    {isRunning ? formatClock(elapsed) : formatTotal(t.my_minutes)}
                  </p>
                  {isRunning && <p className="text-[10px] text-emerald-500">em andamento</p>}
                </div>
                <button
                  type="button"
                  onClick={() => (isRunning ? stopTask(t) : startTask(t))}
                  disabled={busy}
                  title={isRunning ? 'Parar cronômetro' : 'Iniciar cronômetro'}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 disabled:opacity-50 transition-colors ${
                    isRunning
                      ? 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                      : 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25'
                  }`}
                >
                  {isRunning ? <Square size={15} /> : <Play size={15} />}
                </button>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
