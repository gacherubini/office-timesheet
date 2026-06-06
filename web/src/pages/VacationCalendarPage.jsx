import { useEffect, useMemo, useState } from 'react'
import { CalendarOff, ChevronLeft, ChevronRight, Flag, Video, ListTodo } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { getCalendarEvents } from '../lib/calendarClient'
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

function formatDays(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
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

function colorForUser(userId) {
  const palette = [
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  ]
  const seed = String(userId || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[seed % palette.length]
}

export function VacationCalendarPage() {
  const { profile } = useAuth()
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [vacations, setVacations] = useState([])
  const [currentVacations, setCurrentVacations] = useState([])
  const [calendarItems, setCalendarItems] = useState([]) // feriados + agenda Google
  const [tasks, setTasks] = useState([]) // minhas tarefas com prazo
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
      api.get(`/vacation-calendar?start_date=${today}&end_date=${today}`),
      getCalendarEvents(rangeStart, rangeEnd).catch(() => ({ events: [] })),
      profile?.id ? api.get(`/tasks?assignee_id=${profile.id}`).catch(() => []) : Promise.resolve([]),
    ])
      .then(([calendarData, todayData, evResp, tk]) => {
        setVacations(calendarData)
        setCurrentVacations(todayData)
        setCalendarItems(Array.isArray(evResp.events) ? evResp.events : [])
        setTasks(Array.isArray(tk) ? tk : [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [rangeStart, rangeEnd, today, refresh, profile?.id])

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
        subtitle="Férias da equipe, feriados nacionais e sua agenda Google"
      />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Conectar a agenda Google — some quando já conectado. */}
      <div className="mb-5">
        <CalendarConnect hideWhenConnected onChange={() => setRefresh((r) => r + 1)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <CalendarOff size={18} className="text-accent" />
              <h2 className="font-display text-lg capitalize text-text-primary">
                {formatMonth(monthDate)}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMonthDate((current) => addMonths(current, -1))}
                aria-label="Mês anterior"
                title="Mês anterior"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMonthDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              >
                Hoje
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMonthDate((current) => addMonths(current, 1))}
                aria-label="Próximo mês"
                title="Próximo mês"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-alt">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
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
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
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
                      <div className="h-5 rounded bg-surface-alt animate-pulse" />
                    ) : (
                      <>
                        {holidaysByDay[day.key] && (
                          <div
                            className="flex items-center gap-1 truncate rounded px-2 py-1 text-[11px] font-medium bg-rose-500/15 text-rose-600 dark:text-rose-300"
                            title={holidaysByDay[day.key]}
                          >
                            <Flag size={10} className="flex-shrink-0" />
                            <span className="truncate">{holidaysByDay[day.key]}</span>
                          </div>
                        )}
                        {(googleByDay[day.key] || []).slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1 truncate rounded px-2 py-1 text-[11px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            title={ev.title}
                          >
                            <Video size={10} className="flex-shrink-0" />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {(tasksByDay[day.key] || []).slice(0, 3).map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center gap-1 truncate rounded px-2 py-1 text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            title={`Tarefa: ${task.title}${task.project_name ? ' · ' + task.project_name : ''}`}
                          >
                            <ListTodo size={10} className="flex-shrink-0" />
                            <span className="truncate">{task.title}</span>
                          </div>
                        ))}
                        {dayVacations.slice(0, 3).map((vacation) => (
                          <div
                            key={`${day.key}-${vacation.id}`}
                            className={`truncate rounded px-2 py-1 text-[11px] font-medium ${colorForUser(vacation.user_id)}`}
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
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                De férias hoje
              </h2>
            </div>

            <div className="divide-y divide-border-subtle">
              {loading ? (
                <div className="py-8 text-center text-sm text-text-secondary">Carregando...</div>
              ) : currentVacations.length === 0 ? (
                <div className="py-8 px-5 text-center text-sm text-text-secondary">
                  Ninguém de férias hoje.
                </div>
              ) : (
                currentVacations.map((vacation) => (
                  <div key={vacation.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={vacation.profile?.name}
                        url={vacation.profile?.avatar_url}
                        size={36}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {vacation.profile?.name || 'Colaborador'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {formatDate(vacation.start_date)} → {formatDate(vacation.end_date)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
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
    </div>
  )
}
