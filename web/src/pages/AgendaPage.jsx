import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarClock, Flag, Video, ListTodo, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { getCalendarStatus, getCalendarEvents } from '../lib/calendarClient'
import { CalendarConnect } from './profile/CalendarConnect'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function iso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const SOURCE_META = {
  holiday: { icon: Flag, dot: 'bg-rose-500', text: 'text-rose-500', label: 'Feriado' },
  google: { icon: Video, dot: 'bg-sky-500', text: 'text-sky-500', label: 'Google' },
  task: { icon: ListTodo, dot: 'bg-amber-500', text: 'text-amber-500', label: 'Tarefa' },
}

function formatTime(isoStr, allDay) {
  if (allDay) return 'Dia todo'
  const d = new Date(isoStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function AgendaPage() {
  const { profile } = useAuth()
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [connected, setConnected] = useState(true)
  const [calendarError, setCalendarError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)

  const rangeStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const rangeEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const start = iso(rangeStart)
      const end = iso(rangeEnd)
      try {
        const [status, evResp, tk] = await Promise.all([
          getCalendarStatus().catch(() => ({ connected: false })),
          getCalendarEvents(start, end).catch(() => ({ events: [], calendar_error: true })),
          profile?.id ? api.get(`/tasks?assignee_id=${profile.id}`).catch(() => []) : Promise.resolve([]),
        ])
        if (!alive) return
        setConnected(Boolean(status.connected))
        setEvents(Array.isArray(evResp.events) ? evResp.events : [])
        setCalendarError(Boolean(evResp.calendar_error))
        setTasks(Array.isArray(tk) ? tk : [])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, profile?.id, refresh])

  // Junta eventos (Google + feriados) com prazos das tarefas, agrupados por dia.
  const byDay = useMemo(() => {
    const items = [...events]
    for (const t of tasks) {
      if (!t.due_date) continue
      const day = String(t.due_date).slice(0, 10)
      if (day < iso(rangeStart) || day > iso(rangeEnd)) continue
      if (t.status === 'done' || t.status === 'abandoned') continue
      items.push({
        id: `task:${t.id}`,
        title: t.title,
        start: `${day}T00:00:00`,
        all_day: true,
        source: 'task',
        project: t.project_name,
      })
    }
    const map = new Map()
    for (const it of items) {
      const day = it.start.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(it)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, list]) => [day, list.sort((a, b) => a.start.localeCompare(b.start))])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tasks, month])

  function shiftMonth(delta) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  const todayIso = iso(today)

  return (
    <div>
      <PageHeader title="Agenda" subtitle="Seus eventos do Google, feriados e prazos" />

      {/* Conexão só aparece quando ainda não conectado (some ao conectar). */}
      <div className="mb-5">
        <CalendarConnect hideWhenConnected onChange={() => setRefresh((r) => r + 1)} />
      </div>

      {calendarError && connected && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
          <AlertCircle size={15} /> Não consegui ler sua agenda do Google agora. Mostrando o resto.
        </div>
      )}

      <div className="mb-5 flex items-center gap-4">
        <button onClick={() => shiftMonth(-1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="font-display text-lg text-text-primary min-w-[180px] text-center">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </span>
        <button onClick={() => shiftMonth(1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-secondary text-sm">Carregando...</div>
      ) : byDay.length === 0 ? (
        <div className="py-16 text-center text-text-secondary text-sm">
          <CalendarClock size={26} className="mx-auto mb-3 opacity-50" />
          Nada agendado neste mês.
        </div>
      ) : (
        <div className="space-y-3">
          {byDay.map(([day, list]) => {
            const d = new Date(`${day}T00:00:00`)
            const isToday = day === todayIso
            return (
              <Card key={day} padded={false} className="overflow-hidden">
                <div className={`flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle ${isToday ? 'bg-accent/5' : 'bg-surface-alt/40'}`}>
                  <span className={`flex flex-col items-center justify-center h-10 w-10 rounded-lg ${isToday ? 'bg-accent text-white' : 'bg-surface text-text-primary'}`}>
                    <span className="text-sm font-semibold leading-none tabular-nums">{d.getDate()}</span>
                    <span className="text-[9px] uppercase">{WEEKDAYS[d.getDay()]}</span>
                  </span>
                  {isToday && <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Hoje</span>}
                </div>
                <div className="divide-y divide-border-subtle">
                  {list.map((it) => {
                    const meta = SOURCE_META[it.source] || SOURCE_META.google
                    const Icon = meta.icon
                    return (
                      <div key={it.id} className="flex items-center gap-3 px-5 py-3">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                        <Icon size={14} className={`flex-shrink-0 ${meta.text}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text-primary truncate">{it.title}</p>
                          {it.project && <p className="text-[11px] text-text-secondary truncate">{it.project}</p>}
                          {it.location && <p className="text-[11px] text-text-secondary truncate">{it.location}</p>}
                        </div>
                        <span className="text-[11px] text-text-secondary tabular-nums flex-shrink-0">
                          {formatTime(it.start, it.all_day)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
