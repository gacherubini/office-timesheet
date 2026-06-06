import { api } from './api'

export function getCalendarStatus() {
  return api.get('/me/calendar')
}

export function connectCalendar(icsUrl) {
  return api.put('/me/calendar', { ics_url: icsUrl })
}

export function disconnectCalendar() {
  return api.delete('/me/calendar')
}

// Eventos (Google + feriados) num intervalo. start/end no formato YYYY-MM-DD.
export function getCalendarEvents(start, end) {
  return api.get(`/me/calendar/events?start=${start}&end=${end}`)
}
