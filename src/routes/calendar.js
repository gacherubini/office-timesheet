import { Router } from 'express'
import dns from 'node:dns/promises'
import net from 'node:net'
import ical from 'node-ical'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'
import { encrypt, decrypt, isCryptoConfigured } from '../lib/crypto.js'
import { getHolidays } from '../lib/holidays.js'
import { rateLimit } from '../lib/rateLimit.js'

const router = Router()
const calendarPutLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

// Cache em memória do .ics parseado por usuário (TTL 15min) — evita martelar o
// feed do Google a cada navegação.
const CACHE_TTL_MS = 15 * 60 * 1000
const parsedCache = new Map() // userId -> { fetchedAt, parsed }

// Allowlist estrita de host (SEM escape por ".ics" no path — isso liberava SSRF
// pra qualquer host, inclusive metadata/link-local via redirect).
function isAllowedIcsHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  if (host === 'calendar.google.com') return true
  if (host.endsWith('.google.com')) return true
  if (host.endsWith('.googleusercontent.com')) return true
  return false
}

export function isValidIcsUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (!isAllowedIcsHost(url.hostname)) return false
  return true
}

export function isPrivateOrReservedIp(ip) {
  if (!ip) return true
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast/reserved
    return false
  }
  const n = String(ip).toLowerCase()
  if (n === '::1') return true
  if (n.startsWith('fc') || n.startsWith('fd')) return true // ULA
  if (n.startsWith('fe80')) return true // link-local
  if (n.startsWith('::ffff:')) return isPrivateOrReservedIp(n.slice(7))
  return false
}

async function assertPublicHostname(hostname) {
  const results = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!results.length) {
    const err = new Error('host_unresolved')
    err.code = 'ICS_BLOCKED'
    throw err
  }
  for (const r of results) {
    if (isPrivateOrReservedIp(r.address)) {
      const err = new Error('private_address')
      err.code = 'ICS_BLOCKED'
      throw err
    }
  }
}

async function fetchIcsText(urlString) {
  if (!isValidIcsUrl(urlString)) {
    const err = new Error('invalid_url')
    err.code = 'ICS_BLOCKED'
    throw err
  }
  const url = new URL(urlString)
  await assertPublicHostname(url.hostname)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    // redirect: manual — 302 allowlisted → metadata (169.254.169.254) não segue.
    const resp = await fetch(urlString, {
      signal: ctrl.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'office-timesheet-calendar/1.0' },
    })
    if (resp.status >= 300 && resp.status < 400) {
      const err = new Error('redirect_blocked')
      err.code = 'ICS_BLOCKED'
      throw err
    }
    if (!resp.ok) {
      const err = new Error('feed_unavailable')
      err.code = 'ICS_FETCH'
      throw err
    }
    const text = await resp.text()
    if (!text.includes('BEGIN:VCALENDAR')) {
      const err = new Error('invalid_calendar')
      err.code = 'ICS_FETCH'
      throw err
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

function makeEvent(ev, start, end, allDay, key, source) {
  return {
    id: `${source}:${key}:${start.getTime()}`,
    title: ev.summary || '(sem título)',
    start: start.toISOString(),
    end: (end || start).toISOString(),
    all_day: allDay,
    location: ev.location || null,
    description: ev.description || null,
    source,
  }
}

function eventsInRange(parsed, rangeStart, rangeEnd, source = 'google') {
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
        out.push(makeEvent(ev, s, new Date(s.getTime() + durationMs), allDay, key, source))
      }
    } else if (baseEnd >= rangeStart && ev.start <= rangeEnd) {
      out.push(makeEvent(ev, ev.start, baseEnd, allDay, key, source))
    }
  }
  return out
}

// Busca + parseia um .ics, com cache em memória por chave (TTL 15min).
async function getParsedCalendar(cacheKey, url) {
  const cached = parsedCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.parsed
  const text = await fetchIcsText(url)
  const parsed = await ical.async.parseICS(text)
  parsedCache.set(cacheKey, { fetchedAt: Date.now(), parsed })
  return parsed
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
router.put('/me/calendar', requireAuth, calendarPutLimit, async (req, res) => {
  if (!isCryptoConfigured()) {
    return res.status(503).json({ error: 'Recurso de calendário não configurado no servidor.' })
  }
  const { ics_url } = req.body
  if (!ics_url || !isValidIcsUrl(ics_url)) {
    return res.status(400).json({ error: 'URL inválida. Cole o "endereço secreto no formato iCal" do Google.' })
  }
  try {
    await fetchIcsText(ics_url) // valida que dá pra ler antes de salvar
  } catch {
    // Erro genérico: não vazar status HTTP (oráculo de port-scan) nem detalhe de rede.
    return res.status(400).json({
      error: 'Não foi possível ler essa agenda. Use o endereço secreto iCal do Google Calendar.',
    })
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

  // Eventos do Google pessoal (se conectado).
  let googleItems = []
  let calendarError = false
  try {
    const url = await getStoredUrl(req.profile.id)
    if (url) {
      const parsed = await getParsedCalendar(req.profile.id, url)
      googleItems = eventsInRange(parsed, start, end, 'google')
    }
  } catch {
    calendarError = true
  }

  // Eventos da agenda do escritório (compartilhada — todos os usuários veem).
  let officeItems = []
  const officeUrl = process.env.OFFICE_ICS_URL
  if (officeUrl && isValidIcsUrl(officeUrl)) {
    try {
      const parsed = await getParsedCalendar(`office:${officeUrl}`, officeUrl)
      officeItems = eventsInRange(parsed, start, end, 'office')
    } catch {
      // best-effort: agenda do escritório indisponível não quebra o resto
    }
  }

  const events = [...holidayItems, ...officeItems, ...googleItems].sort((a, b) =>
    a.start.localeCompare(b.start)
  )
  return res.json({ events, calendar_error: calendarError })
})

export default router
