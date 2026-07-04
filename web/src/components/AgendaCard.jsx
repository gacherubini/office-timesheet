import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Flag, Video } from 'lucide-react'
import { Card } from './ui/Card'
import { getCalendarStatus, getCalendarEvents } from '../lib/calendarClient'

function iso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayLabel(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Card resumido da agenda (próximos eventos Google + feriados) no dashboard.
export function AgendaCard() {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)
    Promise.all([
      getCalendarStatus().catch(() => ({ connected: false })),
      getCalendarEvents(iso(today), iso(end)).catch(() => ({ events: [] })),
    ])
      .then(([status, resp]) => {
        setConnected(Boolean(status.connected))
        setEvents((resp.events || []).slice(0, 5))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card padded={false} className="overflow-hidden rounded-2xl">
      <div className="px-4 py-3.5 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary inline-flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]">
            <CalendarClock size={14} />
          </span>
          Minha Agenda
        </h2>
        <Link to="/vacation-calendar" className="text-[11px] text-[color:var(--color-accent)] hover:underline">Ver tudo</Link>
      </div>

      <div className="divide-y divide-border-subtle">
        {loading ? (
          <p className="text-xs text-text-secondary text-center py-6">Carregando...</p>
        ) : !connected ? (
          <Link
            to="/profile"
            className="flex items-center justify-center gap-1.5 px-4 py-6 text-center text-xs font-medium text-[color:var(--color-accent)] hover:opacity-80 transition-opacity"
          >
            Conectar agenda do Google →
          </Link>
        ) : events.length === 0 ? (
          <p className="font-serif italic text-[13px] text-text-secondary text-center py-6">Nada nos próximos 14 dias.</p>
        ) : (
          events.map((it) => {
            const holiday = it.source === 'holiday'
            const Icon = holiday ? Flag : Video
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    background: holiday
                      ? 'color-mix(in srgb, #E5484D 14%, transparent)'
                      : 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                    color: holiday ? '#E5484D' : 'var(--color-accent)',
                  }}
                >
                  <Icon size={14} />
                </span>
                <p className="text-[13px] text-text-primary truncate flex-1">{it.title}</p>
                <span className="text-[11px] font-medium text-text-secondary tabular-nums flex-shrink-0">{dayLabel(it.start)}</span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
