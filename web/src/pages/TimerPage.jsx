import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'

export function TimerPage() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [currentEntry, setCurrentEntry] = useState(null) // { id, status, started_at, project_name }
  const [elapsed, setElapsed] = useState(0) // segundos
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const intervalRef = useRef(null)

  // Carrega projetos ativos
  useEffect(() => {
    api.get('/projects').then((data) => {
      const active = data.filter((p) => p.status === 'active')
      setProjects(active)
    })
  }, [])

  // Checa se tem apontamento aberto ao carregar
  useEffect(() => {
    api.get('/me/history?limit=1').then((res) => {
      const entry = res.data?.[0]
      if (entry && (entry.status === 'running' || entry.status === 'paused')) {
        setCurrentEntry({
          id: entry.id,
          status: entry.status,
          started_at: entry.started_at,
          project_name: entry.projects?.name || 'Projeto',
        })
      }
    })
  }, [])

  // Timer visual
  useEffect(() => {
    if (currentEntry?.status === 'running') {
      const start = new Date(currentEntry.started_at).getTime()
      intervalRef.current = setInterval(() => {
        const now = Date.now()
        setElapsed(Math.floor((now - start) / 1000))
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }

    return () => clearInterval(intervalRef.current)
  }, [currentEntry?.status, currentEntry?.started_at])

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  async function handleStart() {
    if (!selectedProject) {
      setError('Selecione um projeto.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const entry = await api.post('/time-entries/start', { project_id: selectedProject })
      const proj = projects.find((p) => p.id === selectedProject)
      setCurrentEntry({
        id: entry.id,
        status: 'running',
        started_at: entry.started_at,
        project_name: proj?.name || 'Projeto',
        project_image: proj?.image_url || null,
      })
      setElapsed(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePause() {
    setLoading(true)
    try {
      await api.post('/time-entries/pause')
      setCurrentEntry((prev) => ({ ...prev, status: 'paused' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResume() {
    setLoading(true)
    try {
      await api.post('/time-entries/resume')
      setCurrentEntry((prev) => ({ ...prev, status: 'running' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    setLoading(true)
    try {
      await api.post('/time-entries/stop')
      setCurrentEntry(null)
      setElapsed(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isIdle = !currentEntry
  const isRunning = currentEntry?.status === 'running'
  const isPaused = currentEntry?.status === 'paused'

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Apontamento</h1>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Timer display */}
      <div className="bg-surface rounded-xl shadow-card border border-border-subtle p-8 text-center mb-6">
        {currentEntry && (
          <div className="flex flex-col items-center gap-2 mb-2">
            {currentEntry.project_image && (
              <img src={currentEntry.project_image} alt="" className="w-12 h-12 rounded-md object-cover" />
            )}
            <p className="text-sm text-text-secondary">{currentEntry.project_name}</p>
          </div>
        )}

        <p className="text-5xl font-mono font-bold tabular-nums text-text-primary mb-2">
          {formatTime(elapsed)}
        </p>

        {isPaused && (
          <span className="inline-block bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
            Pausado
          </span>
        )}
        {isRunning && (
          <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
            Em andamento
          </span>
        )}
      </div>

      {/* Seleção de projeto (só aparece quando idle) */}
      {isIdle && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">Projeto</label>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProject(p.id)}
                className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedProject === p.id
                    ? 'border-accent bg-surface-alt ring-1 ring-accent'
                    : 'border-border-subtle bg-surface hover:border-accent'
                }`}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-surface-alt flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                  {p.client && <p className="text-xs text-text-secondary truncate">{p.client}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-3 justify-center">
        {isIdle && (
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Play size={20} />
            Play
          </button>
        )}

        {isRunning && (
          <>
            <button
              onClick={handlePause}
              disabled={loading}
              className="flex items-center gap-2 bg-yellow-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
            >
              <Pause size={20} />
              Pausar
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Square size={20} />
              Encerrar
            </button>
          </>
        )}

        {isPaused && (
          <>
            <button
              onClick={handleResume}
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={20} />
              Retomar
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Square size={20} />
              Encerrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
