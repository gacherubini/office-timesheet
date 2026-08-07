import { useState, useEffect } from 'react'
import { ListTodo } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/Avatar'

const REFRESH_INTERVAL_S = 15

const STATUS_META = {
  running: { label: 'Em andamento', color: '#16A34A' },
  paused: { label: 'Pausado', color: '#E8B004' },
  offline: { label: 'Offline', color: '#94A0AE' },
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBreakDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function breakLabel({ paused_since, break_minutes, break_count }) {
  if (paused_since) {
    return `Em intervalo desde ${formatTime(paused_since)} · ${formatBreakDuration(break_minutes)}`
  }
  if (break_count > 0) {
    return `Intervalo: ${formatBreakDuration(break_minutes)}`
  }
  return 'Sem intervalo'
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.offline
  return (
    <div className="inline-flex items-center gap-2 text-xs text-text-secondary">
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ background: meta.color }}
      />
      {meta.label}
    </div>
  )
}

export function AdminLivePage() {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_S)

  async function loadLive() {
    try {
      const data = await api.get('/admin/live')
      setTeam(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLive()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          loadLive()
          return REFRESH_INTERVAL_S
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const online = team.filter((m) => m.status !== 'offline')
  const offline = team.filter((m) => m.status === 'offline')

  function UserRow({ user, last }) {
    const meta = STATUS_META[user.status] || STATUS_META.offline
    return (
      <div
        className={`flex items-center justify-between px-5 py-3.5 hover:bg-surface-alt transition-colors ${
          last ? '' : 'border-b border-border-subtle'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <Avatar name={user.name} url={user.avatar_url} size={36} />
            {user.status !== 'offline' && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface"
                style={{ background: meta.color }}
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
            {user.project && (
              <p className="text-xs text-text-secondary truncate">{user.project}</p>
            )}
            {user.task && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-accent truncate">
                <ListTodo size={12} className="flex-shrink-0" />
                <span className="truncate">{user.task}</span>
              </p>
            )}
            {user.status !== 'offline' && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
                {user.started_at && <span>Entrou às {formatTime(user.started_at)}</span>}
                <span className="text-border">·</span>
                <span>{breakLabel(user)}</span>
              </div>
            )}
          </div>
        </div>
        <StatusPill status={user.status} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Painel Live"
        subtitle="Monitoramento em tempo real da equipe"
        badge={
          <span className="text-[11px] text-text-secondary bg-surface-alt px-2.5 py-1">
            Atualiza em {countdown}s
          </span>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-7">
            <Card>
              <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">
                Total
              </p>
              <p className="font-display text-2xl text-text-primary">{team.length}</p>
            </Card>
            <Card>
              <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">
                Online
              </p>
              <p className="font-display text-2xl text-emerald-500">{online.length}</p>
            </Card>
            <Card>
              <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">
                Offline
              </p>
              <p className="font-display text-2xl text-text-secondary">{offline.length}</p>
            </Card>
          </div>

          {online.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-500 mb-2.5">
                Online
              </p>
              <Card padded={false} className="overflow-hidden">
                {online.map((u, i) => (
                  <UserRow key={`on-${u.id}`} user={u} last={i === online.length - 1} />
                ))}
              </Card>
            </div>
          )}

          {offline.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary mb-2.5">
                Offline
              </p>
              <Card padded={false} className="overflow-hidden">
                {offline.map((u, i) => (
                  <UserRow key={`off-${u.id}`} user={u} last={i === offline.length - 1} />
                ))}
              </Card>
            </div>
          )}

          {team.length === 0 && (
            <div className="py-16 text-center text-text-secondary text-sm">
              Nenhum colaborador encontrado.
            </div>
          )}
        </>
      )}
    </div>
  )
}
