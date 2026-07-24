import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { DateField } from '../components/ui/DateField'
import { TimeField } from '../components/ui/TimeField'
import { getCalendarEvents, getCalendarStatus } from '../lib/calendarClient'
import { CalendarConnect } from './profile/CalendarConnect'
import { useAuth } from '../contexts/AuthContext'

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

// Estilo (chip) por tipo de item na agenda. Cores seguem a Legenda do mockup.
const LAYER_STYLE = {
  presence: 'bg-[color:var(--color-accent)]/15 text-accent',
  vacation: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  holiday: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  office: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  google: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

const ICON_BY_KIND = {
  vacation: Plane,
  holiday: Flag,
  office: Building2,
  google: Video,
  presence: CalendarClock,
}

export function AgendaPage() {
  const { profile } = useAuth()
  const [view, setView] = useState('week') // 'week' | 'month'
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState([]) // google + office + holiday
  const [vacations, setVacations] = useState([])
  const [presences, setPresences] = useState([])
  const [connected, setConnected] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [presenceOpen, setPresenceOpen] = useState(false)
  const [presenceInitial, setPresenceInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const [layers, setLayers] = useState({
    personal: true, // Pessoal (Google)
    office: true, // Escritório (Google)
    company: true, // Empresa (comum) — férias + feriados
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
    ])
      .then(([evResp, vac, pres]) => {
        setEvents(Array.isArray(evResp.events) ? evResp.events : [])
        setVacations(Array.isArray(vac) ? vac : [])
        setPresences(Array.isArray(pres) ? pres : [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [rangeStart, rangeEnd, refresh])

  useEffect(() => {
    getCalendarStatus()
      .then((st) => setConnected(Boolean(st.connected)))
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
            kind: 'vacation',
            title: `Férias — ${vac.profile?.name || 'Colaborador'}`,
            allDay: true,
          })
        }
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
  }, [events, vacations, presences, layers, rangeDays, profile?.id])

  // Clique num chip: presença própria abre o editor; eventos abrem o detalhe.
  function handleChipOpen(item) {
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
        actions={
          <>
            <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setView('week')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'week' ? 'bg-surface-alt text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setView('month')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'month' ? 'bg-surface-alt text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Mês
              </button>
            </div>
            <Button onClick={() => { setPresenceInitial(null); setPresenceOpen(true) }}>
              <Plus size={16} /> Marcar presença
            </Button>
          </>
        }
      />

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Painel lateral esquerdo */}
        <div className="space-y-5 order-2 xl:order-1">
          {!connected && <CalendarConnect onChange={() => setRefresh((r) => r + 1)} />}
          {connected && (
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
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
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Minhas agendas
              </h2>
            </div>
            <div className="p-3 space-y-1">
              <LayerToggle
                label="Pessoal (Google)"
                hint={connected ? undefined : 'Conecte sua conta Google'}
                dotClass="bg-sky-500"
                checked={layers.personal}
                onChange={(v) => setLayers((l) => ({ ...l, personal: v }))}
              />
              <LayerToggle
                label="Escritório (Google)"
                dotClass="bg-emerald-500"
                checked={layers.office}
                onChange={(v) => setLayers((l) => ({ ...l, office: v }))}
              />
              <LayerToggle
                label="Empresa (comum)"
                hint="Férias e feriados"
                dotClass="bg-violet-500"
                checked={layers.company}
                onChange={(v) => setLayers((l) => ({ ...l, company: v }))}
              />
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Legenda</h2>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              <LegendItem colorClass="bg-[color:var(--color-accent)]" label="Presença (chego / não vou)" />
              <LegendItem colorClass="bg-violet-500" label="Férias" />
              <LegendItem colorClass="bg-rose-500" label="Feriado / aviso" />
              <div className="pt-2 mt-1 border-t border-border-subtle space-y-2.5">
                <LegendItem colorClass="bg-sky-500" label="Agenda pessoal (Google)" />
                <LegendItem colorClass="bg-emerald-500" label="Agenda do escritório" />
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
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {WEEKDAYS[day.date.getDay()]}
                      </span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday ? 'bg-[color:var(--color-accent)] text-white' : 'text-text-primary'
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {loading ? (
                        <div className="h-5 rounded bg-surface-alt animate-pulse" />
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
                    className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-medium">
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

      <PresenceModal
        open={presenceOpen}
        initial={presenceInitial}
        onClose={() => { setPresenceOpen(false); setPresenceInitial(null) }}
        onSaved={() => { setPresenceOpen(false); setPresenceInitial(null); setRefresh((r) => r + 1) }}
      />
    </div>
  )
}

function LayerToggle({ label, hint, dotClass, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-alt cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border-subtle accent-[color:var(--color-accent)]"
      />
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <span className="min-w-0">
        <span className="block text-sm text-text-primary truncate">{label}</span>
        {hint && <span className="block text-[11px] text-text-secondary truncate">{hint}</span>}
      </span>
    </label>
  )
}

function LegendItem({ colorClass, label, muted }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-3 w-3 rounded-sm flex-shrink-0 ${colorClass}`} />
      <span className="text-text-primary">{label}</span>
      {muted && (
        <span className="ml-auto text-[10px] uppercase tracking-wide text-text-secondary bg-surface-alt rounded px-1.5 py-0.5">
          {muted}
        </span>
      )}
    </div>
  )
}

function EventChip({ item, onOpen }) {
  const Icon = ICON_BY_KIND[item.kind] || CalendarClock
  const style = LAYER_STYLE[item.kind] || LAYER_STYLE.google
  const clickable =
    (item.raw && (item.kind === 'google' || item.kind === 'office')) ||
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
        title={item.kind === 'presence' ? 'Editar/remover minha presença' : item.title}
        className={`flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-[11px] font-medium transition-opacity hover:opacity-80 ${style}`}
      >
        {content}
      </button>
    )
  }
  return (
    <div
      title={item.title}
      className={`flex w-full items-center gap-1 truncate rounded px-2 py-1 text-[11px] font-medium ${style}`}
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
          <div className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 p-3 text-xs">{error}</div>
        )}

        <DateField label="Data" value={date} onChange={(e) => setDate(e.target.value)} />

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Vou ao escritório?</label>
          <div className="inline-flex w-full rounded-lg border border-border-subtle bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setStatus('coming')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                status === 'coming' ? 'bg-[color:var(--color-accent)] text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Chego
            </button>
            <button
              type="button"
              onClick={() => setStatus('absent')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
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
