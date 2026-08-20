import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Flag,
  Video,
  Building2,
  Plane,
  Clock,
  MapPin,
  Plus,
  ListTodo,
  Briefcase,
  ArrowRight,
} from 'lucide-react'
import { api } from '../lib/api'
import { formatDateBR as formatDate } from '../lib/dates'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { TimeField } from '../components/ui/TimeField'
import { getCalendarEvents, getCalendarStatus } from '../lib/calendarClient'
import { fetchHolidays } from '../lib/holidaysClient'
import { CalendarConnect } from './profile/CalendarConnect'
import { useAuth } from '../contexts/AuthContext'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function eventTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function eventDateLabel(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatEventWhen(ev) {
  if (ev.all_day) return `${eventDateLabel(ev.start)} · Dia todo`
  return `${eventDateLabel(ev.start)} · ${eventTime(ev.start)}–${eventTime(ev.end)}`
}

function startOfWeek(date) {
  const s = new Date(date)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}

function addDays(date, amount) {
  const x = new Date(date)
  x.setDate(x.getDate() + amount)
  return x
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function buildCalendarDays(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const start = new Date(firstOfMonth)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      key: dateKey(date),
      inMonth: date.getMonth() === monthDate.getMonth(),
    }
  })
}

function vacationIncludesDate(vacation, key) {
  return vacation.start_date <= key && vacation.end_date >= key
}

// Estilo (chip) por TIPO do item na agenda — a cor codifica o tipo, e só o
// tipo, igual à tela de Calendário (VacationCalendarPage). Origem (pessoal,
// escritório, presença) não tem cor própria: some com o ícone, que já a
// distingue.
const TYPE_STYLE = {
  vacation_approved: 'bg-green/15 text-green-dk',
  vacation_pending: 'bg-orange/15 text-orange',
  holiday: 'bg-brown/15 text-brown',
  office: 'bg-ink/5 text-text-primary',
  google: 'bg-ink/5 text-text-primary',
  presence: 'bg-ink/5 text-text-primary',
  task: 'bg-ink/5 text-text-primary',
}

const ICON_BY_KIND = {
  vacation_approved: Plane,
  vacation_pending: Plane,
  holiday: Flag,
  office: Building2,
  google: Video,
  presence: CalendarClock,
  task: ListTodo,
}

const TASK_STATUS_LABEL = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluída',
  abandoned: 'Abandonada',
}

const TASK_PRIORITY_LABEL = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
}

export function AgendaPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState('week') // 'week' | 'month'
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState([]) // google + office + holiday
  const [vacations, setVacations] = useState([])
  const [presences, setPresences] = useState([])
  const [tasks, setTasks] = useState([]) // minhas tarefas com prazo
  const [upcomingHolidays, setUpcomingHolidays] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [upcomingOffice, setUpcomingOffice] = useState([])
  const [connected, setConnected] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [presenceOpen, setPresenceOpen] = useState(false)
  const [presenceInitial, setPresenceInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const [layers, setLayers] = useState({
    personal: true, // Pessoal (Google)
    office: true, // Escritório (Google)
    company: true, // Empresa (comum) — férias + feriados
    tasks: true, // Minhas tarefas (prazos)
  })

  // Intervalo carregado depende da visão (semana ou mês).
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i)
      return { date, key: dateKey(date) }
    })
  }, [cursor])

  const monthDate = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    [cursor],
  )
  const monthDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])

  const rangeDays = view === 'week' ? weekDays : monthDays
  const rangeStart = rangeDays[0].key
  const rangeEnd = rangeDays[rangeDays.length - 1].key
  const today = dateKey(new Date())

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      getCalendarEvents(rangeStart, rangeEnd).catch(() => ({ events: [] })),
      api.get(`/vacation-calendar?start_date=${rangeStart}&end_date=${rangeEnd}`).catch(() => []),
      api.get(`/presences?start_date=${rangeStart}&end_date=${rangeEnd}`).catch(() => []),
      // As tarefas vêm sem recorte de data (o endpoint não filtra por prazo) e
      // são peneiradas em tasksByDay — por isso não entram na conta do
      // intervalo visível aqui.
      profile?.id ? api.get(`/tasks?assignee_id=${profile.id}`).catch(() => []) : Promise.resolve([]),
    ])
      .then(([evResp, vac, pres, tk]) => {
        setEvents(Array.isArray(evResp.events) ? evResp.events : [])
        setVacations(Array.isArray(vac) ? vac : [])
        setPresences(Array.isArray(pres) ? pres : [])
        setTasks(Array.isArray(tk) ? tk : [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [rangeStart, rangeEnd, refresh, profile?.id])

  useEffect(() => {
    getCalendarStatus()
      .then((st) => setConnected(Boolean(st.connected)))
      .catch(() => {})
  }, [refresh])

  // Painéis do que vem por aí. Eles NÃO seguem o intervalo navegado — é
  // justamente esse o serviço que prestam: na semana de hoje ninguém enxerga o
  // feriado de daqui a três semanas, e antes era preciso trocar de tela para
  // isso. Feriados do ano atual e do seguinte a partir de hoje; agenda (Google
  // e escritório) nos próximos 90 dias.
  useEffect(() => {
    const now = new Date()
    const todayK = dateKey(now)
    const horizon = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90))

    Promise.all([fetchHolidays(now.getFullYear()), fetchHolidays(now.getFullYear() + 1)])
      .then(([atual, seguinte]) => {
        const lista = [...atual, ...seguinte]
          .filter((h) => h.date >= todayK)
          .sort((x, y) => x.date.localeCompare(y.date))
          .slice(0, 6)
        setUpcomingHolidays(lista)
      })
      .catch(() => {})

    getCalendarEvents(todayK, horizon)
      .then((resp) => {
        const evs = resp.events || []
        setUpcomingEvents(evs.filter((e) => e.source === 'google').slice(0, 6))
        setUpcomingOffice(evs.filter((e) => e.source === 'office').slice(0, 6))
      })
      .catch(() => {})
  }, [refresh])

  // Itens (chips) por dia, já filtrados pelas camadas visíveis e ordenados.
  const itemsByDay = useMemo(() => {
    const map = {}
    const push = (key, item) => {
      if (!map[key]) map[key] = []
      map[key].push(item)
    }

    for (const ev of events) {
      const day = ev.start.slice(0, 10)
      if (ev.source === 'holiday') {
        if (!layers.company) continue
        push(day, { id: ev.id, kind: 'holiday', title: ev.title, allDay: true, raw: ev })
      } else if (ev.source === 'office') {
        if (!layers.office) continue
        push(day, {
          id: ev.id,
          kind: 'office',
          title: ev.title,
          allDay: ev.all_day,
          start: ev.start,
          raw: ev,
        })
      } else if (ev.source === 'google') {
        if (!layers.personal) continue
        push(day, {
          id: ev.id,
          kind: 'google',
          title: ev.title,
          allDay: ev.all_day,
          start: ev.start,
          raw: ev,
        })
      }
    }

    if (layers.company) {
      for (const day of rangeDays) {
        for (const vac of vacations) {
          if (!vacationIncludesDate(vac, day.key)) continue
          push(day.key, {
            id: `vac:${vac.id}:${day.key}`,
            kind: vac.status === 'pending' ? 'vacation_pending' : 'vacation_approved',
            title: `Férias — ${vac.profile?.name || 'Colaborador'}`,
            allDay: true,
          })
        }
      }
    }

    // Prazo das minhas tarefas. Concluída e abandonada ficam de fora: o
    // calendário é do que ainda vai acontecer, e prazo cumprido só ocupa o dia.
    if (layers.tasks) {
      for (const t of tasks) {
        if (!t.due_date || t.status === 'done' || t.status === 'abandoned') continue
        push(String(t.due_date).slice(0, 10), {
          id: `task:${t.id}`,
          kind: 'task',
          title: t.title,
          allDay: true,
          hint: `Tarefa: ${t.title}${t.project_name ? ` · ${t.project_name}` : ''}`,
          task: t,
        })
      }
    }

    // Presença (chego / não vou) — sempre visível, cor accent.
    for (const p of presences) {
      const day = String(p.date).slice(0, 10)
      const firstName = (p.user_name || 'Colaborador').split(' ')[0]
      const arrival = p.arrival_time ? String(p.arrival_time).slice(0, 5) : null
      const title =
        p.status === 'absent'
          ? `${firstName} · não vai`
          : `${firstName}${arrival ? ` · chega ${arrival}` : ' · vem'}`
      push(day, {
        id: `pres:${p.id}`,
        kind: 'presence',
        title,
        allDay: !arrival,
        start: arrival ? `${day}T${arrival}` : undefined,
        mine: p.user_id === profile?.id,
        presence: { ...p, date: day, arrival_time: arrival },
      })
    }

    // Ordena: dia todo primeiro, depois por horário.
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
        return (a.start || '').localeCompare(b.start || '')
      })
    }
    return map
  }, [events, vacations, presences, tasks, layers, rangeDays, profile?.id])

  // Clique num chip: presença própria abre o editor; eventos abrem o detalhe.
  function handleChipOpen(item) {
    if (item.kind === 'task') {
      setSelectedTask(item.task)
      return
    }
    if (item.kind === 'presence') {
      if (item.mine) { setPresenceInitial(item.presence); setPresenceOpen(true) }
      return
    }
    setSelectedEvent(item.raw)
  }

  const periodLabel = useMemo(() => {
    if (view === 'month') {
      return monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    }
    const first = weekDays[0].date
    const last = weekDays[6].date
    const sameMonth = first.getMonth() === last.getMonth()
    const firstStr = first.toLocaleDateString('pt-BR', { day: '2-digit', month: sameMonth ? undefined : 'short' })
    const lastStr = last.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${firstStr} – ${lastStr}`
  }, [view, weekDays, monthDate])

  function goPrev() {
    setCursor((c) => (view === 'week' ? addDays(startOfWeek(c), -7) : addMonths(c, -1)))
  }
  function goNext() {
    setCursor((c) => (view === 'week' ? addDays(startOfWeek(c), 7) : addMonths(c, 1)))
  }
  function goToday() {
    setCursor(new Date())
  }

  return (
    <div>
      <PageHeader
        title="Agenda"
        subtitle="Sua semana: agendas Google, escritório, feriados e férias da equipe."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-8 border border-border-subtle">
          {[{ v: 'week', l: 'Semana' }, { v: 'month', l: 'Mês' }].map((o, i) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setView(o.v)}
              className={`px-3 text-[11px] transition-colors ${i === 0 ? 'border-r border-border-subtle' : ''} ${
                view === o.v ? 'bg-ink text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            to="/vacations"
            className="inline-flex h-8 items-center gap-1.5 border border-border-subtle bg-surface px-3 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-alt"
          >
            <Plane size={14} /> Minhas férias
          </Link>
          <Button className="h-8" onClick={() => { setPresenceInitial(null); setPresenceOpen(true) }}>
            <Plus size={15} /> Marcar presença
          </Button>
        </div>
      </div>

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Painel lateral esquerdo */}
        <div className="space-y-5 order-2 xl:order-1">
          {!connected && <CalendarConnect onChange={() => setRefresh((r) => r + 1)} />}
          {connected && (
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 state-success-soft flex items-center justify-center">
                  <CalendarClock size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">Google conectado</p>
                  <p className="text-xs text-text-secondary">Seus eventos aparecem na agenda.</p>
                </div>
              </div>
            </Card>
          )}

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Minhas agendas
              </h2>
            </div>
            <div className="p-3 space-y-1">
              <LayerToggle
                label="Pessoal (Google)"
                hint={connected ? undefined : 'Conecte sua conta Google'}
                checked={layers.personal}
                onChange={(v) => setLayers((l) => ({ ...l, personal: v }))}
              />
              <LayerToggle
                label="Escritório (Google)"
                checked={layers.office}
                onChange={(v) => setLayers((l) => ({ ...l, office: v }))}
              />
              <LayerToggle
                label="Empresa (comum)"
                hint="Férias e feriados"
                checked={layers.company}
                onChange={(v) => setLayers((l) => ({ ...l, company: v }))}
              />
              <LayerToggle
                label="Minhas tarefas"
                hint="Prazos em aberto"
                checked={layers.tasks}
                onChange={(v) => setLayers((l) => ({ ...l, tasks: v }))}
              />
            </div>
          </Card>

          {/* Os três painéis abaixo não seguem o intervalo navegado — é para
              isso que servem. Ver a semana não pode custar enxergar o que vem
              depois dela. */}
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary inline-flex items-center gap-1.5">
                <Flag size={13} className="text-brown" /> Próximos feriados
              </h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {upcomingHolidays.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">Sem feriados próximos.</div>
              ) : (
                upcomingHolidays.map((h) => (
                  <div key={h.date} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-sm text-text-primary truncate">{h.name}</span>
                    <span className="text-xs text-text-secondary tabular-nums flex-shrink-0">{formatDate(h.date)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary inline-flex items-center gap-1.5">
                <Building2 size={13} className="text-text-secondary" /> Agenda do escritório
              </h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {upcomingOffice.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Nada nos próximos 90 dias.
                </div>
              ) : (
                upcomingOffice.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left px-5 py-3 hover:bg-surface-alt transition-colors flex items-center gap-2.5"
                  >
                    <Building2 size={14} className="text-text-secondary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{ev.title}</p>
                      <p className="text-xs text-text-secondary">{formatEventWhen(ev)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary inline-flex items-center gap-1.5">
                <Video size={13} className="text-text-secondary" /> Próximos eventos
              </h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {upcomingEvents.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  {/* Vazio por falta de conexão não é a mesma notícia que agenda
                      vazia — quem nunca conectou precisa saber que é isso. */}
                  {connected
                    ? 'Nada nos próximos 90 dias.'
                    : 'Conecte sua agenda Google acima para ver seus eventos.'}
                </div>
              ) : (
                upcomingEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left px-5 py-3 hover:bg-surface-alt transition-colors flex items-center gap-2.5"
                  >
                    <Video size={14} className="text-text-secondary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{ev.title}</p>
                      <p className="text-xs text-text-secondary">{formatEventWhen(ev)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* "No período" e não "no mês": aqui a visão pode ser a semana, e o
              painel acompanha o intervalo desenhado. O chip no dia diz quem
              está de férias; este diz até quando e quantos dias. */}
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Férias no período
              </h2>
            </div>
            <div className="divide-y divide-border-subtle">
              {loading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : vacations.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Ninguém de férias neste período.
                </div>
              ) : (
                vacations.map((vacation) => (
                  <div key={vacation.id} className="p-4 space-y-1">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {vacation.profile?.name || 'Colaborador'}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                    </p>
                    <p className="text-xs text-text-secondary">{formatDays(vacation.days_count)}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Legenda</h2>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              <LegendItem colorClass="bg-green" label="Férias aprovadas" />
              <LegendItem colorClass="bg-orange" label="Férias pendentes" />
              <LegendItem colorClass="bg-brown" label="Feriado" />
              <div className="pt-2 mt-1 border-t border-border-subtle space-y-2.5">
                <LegendItem Icon={Video} label="Compromisso pessoal (Google)" />
                <LegendItem Icon={Building2} label="Compromisso do escritório" />
                <LegendItem Icon={CalendarClock} label="Presença (chego / não vou)" />
                <LegendItem Icon={ListTodo} label="Prazo de tarefa minha" />
              </div>
            </div>
          </Card>
        </div>

        {/* Área principal do calendário */}
        <Card padded={false} className="overflow-hidden order-1 xl:order-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-accent" />
              <h2 className="font-display text-lg capitalize text-text-primary">{periodLabel}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={goPrev} aria-label="Anterior" title="Anterior">
                <ChevronLeft size={16} />
              </Button>
              <Button variant="secondary" size="sm" onClick={goToday}>
                Hoje
              </Button>
              <Button variant="secondary" size="sm" onClick={goNext} aria-label="Próximo" title="Próximo">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div data-testid="agenda-grade">
          {view === 'week' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              {weekDays.map((day) => {
                const isToday = day.key === today
                const items = itemsByDay[day.key] || []
                return (
                  <div
                    key={day.key}
                    className={`min-h-[16rem] border-r border-b border-border-subtle p-2 ${
                      isToday ? 'bg-[color:var(--color-accent)]/[0.06]' : 'bg-surface'
                    }`}
                  >
                    <div className="mb-2 flex flex-col items-center gap-0.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                        {WEEKDAYS[day.date.getDay()]}
                      </span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center text-xs font-medium ${
                          isToday ? 'bg-[color:var(--color-accent)] text-white' : 'text-text-primary'
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {loading ? (
                        <div className="h-5 bg-surface-alt animate-pulse" />
                      ) : items.length === 0 ? (
                        <p className="text-center text-[11px] text-text-secondary/70 pt-2">—</p>
                      ) : (
                        items.map((item) => <EventChip key={item.id} item={item} onOpen={handleChipOpen} />)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-alt">
                {WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    className="px-2 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-text-secondary"
                  >
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const isToday = day.key === today
                  const items = itemsByDay[day.key] || []
                  return (
                    <div
                      key={day.key}
                      className={`min-h-28 sm:min-h-36 border-r border-b border-border-subtle p-2 ${
                        day.inMonth ? 'bg-surface' : 'bg-surface-alt/60'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span
                          className={`flex h-7 w-7 items-center justify-center text-xs font-medium ${
                            isToday
                              ? 'bg-[color:var(--color-accent)] text-white'
                              : day.inMonth
                                ? 'text-text-primary'
                                : 'text-text-secondary'
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {loading ? (
                          <div className="h-5 bg-surface-alt animate-pulse" />
                        ) : (
                          <>
                            {items.slice(0, 4).map((item) => (
                              <EventChip key={item.id} item={item} onOpen={handleChipOpen} />
                            ))}
                            {items.length > 4 && (
                              <p className="text-[11px] text-text-secondary px-1">+{items.length - 4}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          </div>
        </Card>
      </div>

      {/* Detalhe de um evento (Google / escritório) */}
      {selectedEvent && (
        <Modal
          open
          onClose={() => setSelectedEvent(null)}
          title={selectedEvent.title}
          size="sm"
          footer={<Button variant="secondary" onClick={() => setSelectedEvent(null)}>Fechar</Button>}
        >
          <div className="space-y-3 text-sm">
            {selectedEvent.source === 'office' && (
              <span className="inline-flex items-center gap-1.5 bg-surface-alt text-text-secondary px-2.5 py-1 text-xs font-medium">
                <Building2 size={12} /> Agenda do escritório
              </span>
            )}
            <div className="flex items-center gap-2 text-text-secondary">
              <Clock size={15} className="flex-shrink-0" />
              <span>{formatEventWhen(selectedEvent)}</span>
            </div>
            {selectedEvent.location && (
              <div className="flex items-start gap-2 text-text-secondary">
                <MapPin size={15} className="flex-shrink-0 mt-0.5" />
                <span>{selectedEvent.location}</span>
              </div>
            )}
            {selectedEvent.description && (
              <p className="whitespace-pre-wrap text-text-primary border-t border-border-subtle pt-3">
                {selectedEvent.description}
              </p>
            )}
            {!selectedEvent.location && !selectedEvent.description && (
              <p className="text-xs text-text-secondary">Sem mais detalhes neste evento.</p>
            )}
          </div>
        </Modal>
      )}

      {/* Detalhe de um prazo de tarefa */}
      {selectedTask && (
        <Modal
          open
          onClose={() => setSelectedTask(null)}
          title={selectedTask.title}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSelectedTask(null)}>
                Fechar
              </Button>
              {/* /projetos e não /project-board: as duas rotas desenham a mesma
                  página, mas o isActive do Topbar compara o caminho exato — pela
                  legada a pessoa chega ao quadro com o menu apagado. */}
              <Button onClick={() => navigate(`/projetos?task=${selectedTask.id}`)}>
                Abrir no quadro <ArrowRight size={15} />
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-surface-alt text-text-secondary px-2.5 py-1 text-xs font-medium">
              <ListTodo size={12} /> Tarefa
            </span>
            {selectedTask.project_name && (
              <div className="flex items-center gap-2 text-text-secondary">
                <Briefcase size={15} className="flex-shrink-0" />
                <span>{selectedTask.project_name}</span>
              </div>
            )}
            {selectedTask.due_date && (
              <div className="flex items-center gap-2 text-text-secondary">
                <Clock size={15} className="flex-shrink-0" />
                <span>Prazo: {formatDate(String(selectedTask.due_date).slice(0, 10))}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {TASK_STATUS_LABEL[selectedTask.status] && (
                <span className="bg-surface-alt px-2.5 py-1 text-xs text-text-secondary">
                  {TASK_STATUS_LABEL[selectedTask.status]}
                </span>
              )}
              {TASK_PRIORITY_LABEL[selectedTask.priority] && (
                <span className="bg-surface-alt px-2.5 py-1 text-xs text-text-secondary">
                  Prioridade: {TASK_PRIORITY_LABEL[selectedTask.priority]}
                </span>
              )}
            </div>
            {selectedTask.description && (
              <p className="whitespace-pre-wrap text-text-primary border-t border-border-subtle pt-3">
                {selectedTask.description}
              </p>
            )}
          </div>
        </Modal>
      )}

      <PresenceModal
        open={presenceOpen}
        initial={presenceInitial}
        onClose={() => { setPresenceOpen(false); setPresenceInitial(null) }}
        onSaved={() => { setPresenceOpen(false); setPresenceInitial(null); setRefresh((r) => r + 1) }}
      />
    </div>
  )
}

// Camada = origem do calendário, não tipo. Filtra a origem; não tem cor
// própria (a cor é reservada para o tipo, ver TYPE_STYLE/Legenda).
function LayerToggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-surface-alt cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 border-border-subtle accent-[color:var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-text-primary truncate">{label}</span>
        {hint && <span className="block text-[11px] text-text-secondary truncate">{hint}</span>}
      </span>
    </label>
  )
}

// Item de legenda: `colorClass` para tipos com cor própria (férias, feriado);
// `Icon` para os tipos neutros, distinguidos só pelo ícone (já usado no chip).
function LegendItem({ colorClass, label, Icon }) {
  return (
    <div className="flex items-center gap-2.5">
      {Icon ? (
        <Icon size={13} className="flex-shrink-0 text-text-secondary" />
      ) : (
        <span className={`h-3 w-3 flex-shrink-0 ${colorClass}`} />
      )}
      <span className="text-text-primary">{label}</span>
    </div>
  )
}

function EventChip({ item, onOpen }) {
  const Icon = ICON_BY_KIND[item.kind] || CalendarClock
  const style = TYPE_STYLE[item.kind] || TYPE_STYLE.google
  const clickable =
    (item.raw && (item.kind === 'google' || item.kind === 'office')) ||
    item.kind === 'task' ||
    (item.kind === 'presence' && item.mine)
  const content = (
    <>
      <Icon size={10} className="flex-shrink-0" />
      <span className="truncate">
        {!item.allDay && item.start && <span className="tabular-nums">{eventTime(item.start)} </span>}
        {item.title}
      </span>
    </>
  )
  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        title={item.hint || (item.kind === 'presence' ? 'Editar/remover minha presença' : item.title)}
        className={`flex w-full items-center gap-1 truncate px-2 py-1 text-left text-[11px] font-medium transition-opacity hover:opacity-80 ${style}`}
      >
        {content}
      </button>
    )
  }
  return (
    <div
      title={item.hint || item.title}
      className={`flex w-full items-center gap-1 truncate px-2 py-1 text-[11px] font-medium ${style}`}
    >
      {content}
    </div>
  )
}

// Marcar presença: chego (com horário) ou não vou, com motivo opcional.
// `initial` (opcional) = presença existente para editar/remover.
function PresenceModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial)
  const [date, setDate] = useState(dateKey(new Date()))
  const [status, setStatus] = useState('coming') // 'coming' | 'absent'
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sincroniza os campos quando abre (novo ou edição).
  useEffect(() => {
    if (!open) return
    setError('')
    setDate(initial?.date || dateKey(new Date()))
    setStatus(initial?.status || 'coming')
    setTime(initial?.arrival_time ? String(initial.arrival_time).slice(0, 5) : '')
    setReason(initial?.reason || '')
  }, [open, initial])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.post('/presences', {
        date,
        status,
        arrival_time: status === 'coming' ? (time || null) : null,
        reason: reason.trim() || null,
      })
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await api.delete(`/presences/${date}`)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar presença' : 'Marcar presença'}
      size="sm"
      footer={
        <>
          {editing && (
            <Button variant="danger" onClick={handleDelete} disabled={saving} className="mr-auto">
              Remover
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !date}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="state-danger-soft p-3 text-xs">{error}</div>
        )}

        <DateField label="Data" value={date} onChange={(e) => setDate(e.target.value)} />

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Vou ao escritório?</label>
          <div className="inline-flex w-full border border-border-subtle bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setStatus('coming')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${
                status === 'coming' ? 'bg-[color:var(--color-accent)] text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Chego
            </button>
            <button
              type="button"
              onClick={() => setStatus('absent')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${
                status === 'absent' ? 'bg-[color:var(--color-accent)] text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Não vou
            </button>
          </div>
        </div>

        {status === 'coming' && (
          <TimeField
            label="Horário de chegada"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        )}

        <Input
          label="Motivo (opcional)"
          as="textarea"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={status === 'absent' ? 'Ex.: home office, consulta médica…' : 'Ex.: chego mais tarde…'}
          className="[&_textarea]:resize-none"
        />
      </div>
    </Modal>
  )
}
