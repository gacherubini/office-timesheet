import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarOff, ChevronLeft, ChevronRight, Flag, Video, ListTodo, Clock, MapPin, Building2, ArrowRight, Briefcase } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { getCalendarEvents, getCalendarStatus } from '../lib/calendarClient'
import { fetchHolidays } from '../lib/holidaysClient'
import { CalendarConnect } from './profile/CalendarConnect'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(value) {
  if (!value) return '-'
  return parseDate(value).toLocaleDateString('pt-BR')
}

function formatMonth(date) {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
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

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
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

// Cor por categoria, não por pessoa: aprovadas em verde, pendentes em laranja —
// mesma lógica da Agenda, para as duas telas de calendário conversarem.
function vacationStyle(vacation) {
  return vacation.status === 'pending'
    ? 'bg-orange/15 text-orange'
    : 'bg-green/15 text-green-dk'
}

export function VacationCalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [vacations, setVacations] = useState([])
  const [calendarItems, setCalendarItems] = useState([]) // feriados + agenda Google
  const [tasks, setTasks] = useState([]) // minhas tarefas com prazo
  const [upcomingHolidays, setUpcomingHolidays] = useState([]) // próximos feriados
  const [upcomingEvents, setUpcomingEvents] = useState([]) // próximos eventos Google
  const [upcomingOffice, setUpcomingOffice] = useState([]) // próximos eventos do escritório
  const [connected, setConnected] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const rangeStart = calendarDays[0].key
  const rangeEnd = calendarDays[calendarDays.length - 1].key
  const monthStart = dateKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
  const monthEnd = dateKey(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0))
  const today = dateKey(new Date())

  const monthlyVacations = useMemo(
    () => vacations.filter((vacation) => vacation.start_date <= monthEnd && vacation.end_date >= monthStart),
    [vacations, monthEnd, monthStart],
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.get(`/vacation-calendar?start_date=${rangeStart}&end_date=${rangeEnd}`),
      getCalendarEvents(rangeStart, rangeEnd).catch(() => ({ events: [] })),
      profile?.id ? api.get(`/tasks?assignee_id=${profile.id}`).catch(() => []) : Promise.resolve([]),
    ])
      .then(([calendarData, evResp, tk]) => {
        setVacations(calendarData)
        setCalendarItems(Array.isArray(evResp.events) ? evResp.events : [])
        setTasks(Array.isArray(tk) ? tk : [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [rangeStart, rangeEnd, refresh, profile?.id])

  // Painel "próximos" (independente do mês navegado): feriados do ano atual +
  // seguinte a partir de hoje, e eventos do Google nos próximos 90 dias.
  useEffect(() => {
    const now = new Date()
    const todayK = dateKey(now)
    const horizon = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90))

    Promise.all([fetchHolidays(now.getFullYear()), fetchHolidays(now.getFullYear() + 1)])
      .then(([a, b]) => {
        const list = [...a, ...b]
          .filter((h) => h.date >= todayK)
          .sort((x, y) => x.date.localeCompare(y.date))
          .slice(0, 6)
        setUpcomingHolidays(list)
      })
      .catch(() => {})

    Promise.all([
      getCalendarStatus().catch(() => ({ connected: false })),
      getCalendarEvents(todayK, horizon).catch(() => ({ events: [] })),
    ]).then(([st, resp]) => {
      setConnected(Boolean(st.connected))
      const evs = resp.events || []
      setUpcomingEvents(evs.filter((e) => e.source === 'google').slice(0, 6))
      setUpcomingOffice(evs.filter((e) => e.source === 'office').slice(0, 6))
    })
  }, [refresh])

  // Feriados (1 por dia) e eventos da agenda Google, indexados por dia.
  const holidaysByDay = useMemo(() => {
    const map = {}
    for (const it of calendarItems) {
      if (it.source === 'holiday') map[it.start.slice(0, 10)] = it.title
    }
    return map
  }, [calendarItems])

  const googleByDay = useMemo(() => {
    const map = {}
    for (const it of calendarItems) {
      if (it.source !== 'google') continue
      const day = it.start.slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(it)
    }
    return map
  }, [calendarItems])

  // Agenda do escritório (compartilhada, todos veem), por dia.
  const officeByDay = useMemo(() => {
    const map = {}
    for (const it of calendarItems) {
      if (it.source !== 'office') continue
      const day = it.start.slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(it)
    }
    return map
  }, [calendarItems])

  // Prazos das minhas tarefas (ignora concluídas/abandonadas), por dia.
  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!t.due_date || t.status === 'done' || t.status === 'abandoned') continue
      const day = String(t.due_date).slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(t)
    }
    return map
  }, [tasks])

  return (
    <div>
      <PageHeader
        title="Calendário"
        subtitle="Férias da equipe, feriados nacionais, agenda do escritório e sua agenda Google"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[160px] flex-1 items-center gap-2">
          <CalendarOff size={18} className="text-accent" />
          <h2 className="font-display text-lg capitalize text-text-primary">
            {formatMonth(monthDate)}
          </h2>
        </div>

        <div className="flex h-8 border border-border-subtle">
          <button
            type="button"
            onClick={() => setMonthDate((current) => addMonths(current, -1))}
            aria-label="Mês anterior"
            title="Mês anterior"
            className="flex h-8 w-8 items-center justify-center border-r border-border-subtle text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMonthDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="border-r border-border-subtle px-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setMonthDate((current) => addMonths(current, 1))}
            aria-label="Próximo mês"
            title="Próximo mês"
            className="flex h-8 w-8 items-center justify-center text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      {/* Conectar a agenda Google — some quando já conectado. */}
      <div className="mb-5">
        <CalendarConnect hideWhenConnected onChange={() => setRefresh((r) => r + 1)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <Card padded={false} className="overflow-hidden">
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
            {calendarDays.map((day) => {
              const dayVacations = vacations.filter((vacation) => vacationIncludesDate(vacation, day.key))
              const isToday = day.key === today

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
                        {holidaysByDay[day.key] && (
                          <div
                            className="flex items-center gap-1 truncate px-2 py-1 text-[11px] font-medium bg-brown/15 text-brown"
                            title={holidaysByDay[day.key]}
                          >
                            <Flag size={10} className="flex-shrink-0" />
                            <span className="truncate">{holidaysByDay[day.key]}</span>
                          </div>
                        )}
                        {(officeByDay[day.key] || []).slice(0, 4).map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEvent(ev)}
                            className="flex w-full items-center gap-1 truncate px-2 py-1 text-left text-[11px] font-medium bg-ink/5 text-text-primary hover:bg-ink/10 transition-colors"
                            title={`Escritório · ${ev.title}${ev.location ? ' · ' + ev.location : ''}`}
                          >
                            <Building2 size={10} className="flex-shrink-0" />
                            <span className="truncate">
                              {!ev.all_day && <span className="tabular-nums">{eventTime(ev.start)} </span>}
                              {ev.title}
                            </span>
                          </button>
                        ))}
                        {(officeByDay[day.key] || []).length > 4 && (
                          <p className="text-[11px] text-text-secondary px-1">
                            +{officeByDay[day.key].length - 4} do escritório
                          </p>
                        )}
                        {(googleByDay[day.key] || []).slice(0, 4).map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEvent(ev)}
                            className="flex w-full items-center gap-1 truncate px-2 py-1 text-left text-[11px] font-medium bg-ink/5 text-text-primary hover:bg-ink/10 transition-colors"
                            title={`${ev.title}${ev.location ? ' · ' + ev.location : ''}`}
                          >
                            <Video size={10} className="flex-shrink-0" />
                            <span className="truncate">
                              {!ev.all_day && <span className="tabular-nums">{eventTime(ev.start)} </span>}
                              {ev.title}
                            </span>
                          </button>
                        ))}
                        {(googleByDay[day.key] || []).length > 4 && (
                          <p className="text-[11px] text-text-secondary px-1">
                            +{googleByDay[day.key].length - 4} eventos
                          </p>
                        )}
                        {(tasksByDay[day.key] || []).slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className="flex w-full items-center gap-1 truncate px-2 py-1 text-left text-[11px] font-medium bg-ink/5 text-text-primary hover:bg-ink/10 transition-colors"
                            title={`Tarefa: ${task.title}${task.project_name ? ' · ' + task.project_name : ''}`}
                          >
                            <ListTodo size={10} className="flex-shrink-0" />
                            <span className="truncate">{task.title}</span>
                          </button>
                        ))}
                        {dayVacations.slice(0, 3).map((vacation) => (
                          <div
                            key={`${day.key}-${vacation.id}`}
                            className={`truncate px-2 py-1 text-[11px] font-medium ${vacationStyle(vacation)}`}
                            title={`${vacation.profile?.name || 'Colaborador'}: ${formatDate(vacation.start_date)} até ${formatDate(vacation.end_date)}`}
                          >
                            {vacation.profile?.name || 'Colaborador'}
                          </div>
                        ))}
                        {dayVacations.length > 3 && (
                          <p className="text-[11px] text-text-secondary px-1">
                            +{dayVacations.length - 3}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="space-y-5">
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

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Férias no mês
              </h2>
            </div>

            <div className="divide-y divide-border-subtle">
              {loading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : monthlyVacations.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Nenhuma férias aprovada neste período.
                </div>
              ) : (
                monthlyVacations.map((vacation) => (
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
        </div>
      </div>

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
              <Button onClick={() => navigate(`/project-board?task=${selectedTask.id}`)}>
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
    </div>
  )
}
