import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'
import { encrypt, isCryptoConfigured } from '../lib/crypto.js'
import { rateLimit } from '../lib/rateLimit.js'
import {
  isValidIcsUrl,
  fetchIcsText,
  isCalendarConnected,
  listEventsForUser,
  invalidateCalendarCache,
} from '../lib/calendar/events.js'

export { isValidIcsUrl, isPrivateOrReservedIp } from '../lib/calendar/events.js'

const router = Router()
const calendarPutLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

// ─── Status do vínculo ─────────────────────────────────────────────────
router.get('/me/calendar', requireAuth, async (req, res) => {
  try {
    const connected = await isCalendarConnected(req.profile.id)
    return res.json({ connected })
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
    invalidateCalendarCache(req.profile.id)
    return res.json({ connected: true })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Desconectar ───────────────────────────────────────────────────────
router.delete('/me/calendar', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM user_calendars WHERE user_id = $1', [req.profile.id])
    invalidateCalendarCache(req.profile.id)
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

  const { events, calendar_error } = await listEventsForUser(req.profile.id, start, end)
  return res.json({ events, calendar_error })
})

export default router
