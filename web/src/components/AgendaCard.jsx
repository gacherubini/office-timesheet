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
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle bg-surface-alt flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary inline-flex items-center gap-1.5">
          <CalendarClock size={13} /> Minha Agenda
        </h2>
        <Link to="/vacation-calendar" className="text-[11px] text-accent hover:underline">Ver tudo</Link>
      </div>

      <div className="divide-y divide-border-subtle">
        {loading ? (
          <p className="text-xs text-text-secondary text-center py-5">Carregando...</p>
        ) : !connected ? (
          <Link to="/profile" className="block px-4 py-5 text-center text-xs text-text-secondary hover:text-text-primary">
            Conectar agenda do Google →
          </Link>
        ) : events.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-5">Nada nos próximos 14 dias.</p>
        ) : (
          events.map((it) => {
            const Icon = it.source === 'holiday' ? Flag : Video
            const color = it.source === 'holiday' ? 'text-rose-500' : 'text-sky-500'
            return (
              <div key={it.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Icon size={13} className={`flex-shrink-0 ${color}`} />
                <p className="text-[13px] text-text-primary truncate flex-1">{it.title}</p>
                <span className="text-[11px] text-text-secondary tabular-nums flex-shrink-0">{dayLabel(it.start)}</span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
