import { Router } from 'express'
import ical from 'node-ical'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'
import { encrypt, decrypt, isCryptoConfigured } from '../lib/crypto.js'
import { getHolidays } from '../lib/holidays.js'

const router = Router()

// Cache em memória do .ics parseado por usuário (TTL 15min) — evita martelar o
// feed do Google a cada navegação.
const CACHE_TTL_MS = 15 * 60 * 1000
const parsedCache = new Map() // userId -> { fetchedAt, parsed }

// Só aceita https e hosts de calendário conhecidos / URLs .ics — barra SSRF
// pra hosts internos.
function isValidIcsUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  const okHost = host === 'calendar.google.com' || host.endsWith('.google.com')
  const okPath = url.pathname.toLowerCase().endsWith('.ics')
  return okHost || okPath
}

async function fetchIcsText(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const resp = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    if (!resp.ok) throw new Error(`feed retornou ${resp.status}`)
    const text = await resp.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('conteúdo não é um calendário iCal')
    return text
  } finally {
    clearTimeout(timer)
  }
}

function makeEvent(ev, start, end, allDay, key) {
  return {
    id: `${key}:${start.getTime()}`,
    title: ev.summary || '(sem título)',
    start: start.toISOString(),
    end: (end || start).toISOString(),
    all_day: allDay,
    location: ev.location || null,
    source: 'google',
  }
}

function eventsInRange(parsed, rangeStart, rangeEnd) {
  const out = []
  for (const key of Object.keys(parsed)) {
    const ev = parsed[key]
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue
    const allDay = ev.datetype === 'date'
    const baseEnd = ev.end || ev.start
    const durationMs = baseEnd.getTime() - ev.start.getTime()

    if (ev.rrule) {
      const occurrences = ev.rrule.between(rangeStart, rangeEnd, true)
      const exdates = ev.exdate
        ? Object.values(ev.exdate).map((d) => new Date(d).toDateString())
        : []
      for (const occ of occurrences) {
        const s = new Date(occ)
        if (exdates.includes(s.toDateString())) continue
        out.push(makeEvent(ev, s, new Date(s.getTime() + durationMs), allDay, key))
      }
    } else if (baseEnd >= rangeStart && ev.start <= rangeEnd) {
      out.push(makeEvent(ev, ev.start, baseEnd, allDay, key))
    }
  }
  return out
}

async function getStoredUrl(userId) {
  const { rows } = await query('SELECT ics_url FROM user_calendars WHERE user_id = $1', [userId])
  if (rows.length === 0) return null
  return decrypt(rows[0].ics_url)
}

// ─── Status do vínculo ─────────────────────────────────────────────────
router.get('/me/calendar', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT 1 FROM user_calendars WHERE user_id = $1',
      [req.profile.id]
    )
    return res.json({ connected: rows.length > 0 })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Conectar (salvar URL secreta) ─────────────────────────────────────
router.put('/me/calendar', requireAuth, async (req, res) => {
  if (!isCryptoConfigured()) {
    return res.status(503).json({ error: 'Recurso de calendário não configurado no servidor.' })
  }
  const { ics_url } = req.body
  if (!ics_url || !isValidIcsUrl(ics_url)) {
    return res.status(400).json({ error: 'URL inválida. Cole o "endereço secreto no formato iCal" do Google.' })
  }
  try {
    await fetchIcsText(ics_url) // valida que dá pra ler antes de salvar
  } catch (err) {
    return res.status(400).json({ error: `Não foi possível ler essa agenda: ${err.message}` })
  }
  try {
    await query(
      `INSERT INTO user_calendars (user_id, ics_url, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET ics_url = EXCLUDED.ics_url, updated_at = now()`,
      [req.profile.id, encrypt(ics_url)]
    )
    parsedCache.delete(req.profile.id)
    return res.json({ connected: true })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Desconectar ───────────────────────────────────────────────────────
router.delete('/me/calendar', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_calendars WHERE user_id = $1', [req.profile.id])
    parsedCache.delete(req.profile.id)
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Eventos no intervalo (Google + feriados) ──────────────────────────
router.get('/me/calendar/events', requireAuth, async (req, res) => {
  const start = req.query.start ? new Date(`${req.query.start}T00:00:00`) : null
  const end = req.query.end ? new Date(`${req.query.end}T23:59:59`) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: 'start e end (YYYY-MM-DD) são obrigatórios.' })
  }

  // Feriados dos anos que o intervalo cobre.
  const holidayItems = []
  try {
    const years = new Set([start.getFullYear(), end.getFullYear()])
    for (const y of years) {
      const hs = await getHolidays(y)
      for (const h of hs) {
        const d = new Date(`${h.date}T00:00:00`)
        if (d >= start && d <= end) {
          holidayItems.push({
            id: `holiday:${h.date}`,
            title: h.name,
            start: `${h.date}T00:00:00`,
            end: `${h.date}T00:00:00`,
            all_day: true,
            location: null,
            source: 'holiday',
          })
        }
      }
    }
  } catch {
    // feriados são best-effort; segue sem eles
  }

  // Eventos do Google (se conectado).
  let googleItems = []
  let calendarError = false
  try {
    const url = await getStoredUrl(req.profile.id)
    if (url) {
      const cached = parsedCache.get(req.profile.id)
      let parsed
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        parsed = cached.parsed
      } else {
        const text = await fetchIcsText(url)
        parsed = await ical.async.parseICS(text)
        parsedCache.set(req.profile.id, { fetchedAt: Date.now(), parsed })
      }
      googleItems = eventsInRange(parsed, start, end)
    }
  } catch {
    calendarError = true
  }

  const events = [...holidayItems, ...googleItems].sort((a, b) => a.start.localeCompare(b.start))
  return res.json({ events, calendar_error: calendarError })
})

export default router
