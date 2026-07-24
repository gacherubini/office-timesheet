import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'

const router = Router()

const VALID_STATUS = ['coming', 'absent']

// Lista presenças da equipe num intervalo (para a camada de Presença na Agenda).
router.get('/presences', requireAuth, async (req, res) => {
  const { start_date, end_date } = req.query
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }
  try {
    const { rows } = await query(
      `SELECT p.id, p.user_id, p.date, p.status, p.arrival_time, p.reason,
              u.name AS user_name, u.avatar_url AS user_avatar_url
       FROM presences p
       JOIN users u ON u.id = p.user_id
       WHERE p.date >= $1 AND p.date <= $2 AND u.deleted_at IS NULL
       ORDER BY p.date, u.name`,
      [start_date, end_date]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Marca (ou atualiza) a própria presença de um dia. Upsert por (user, date).
router.post('/presences', requireAuth, async (req, res) => {
  const { date, status, arrival_time, reason } = req.body
  if (!date) return res.status(400).json({ error: 'date é obrigatório.' })
  const finalStatus = status || 'coming'
  if (!VALID_STATUS.includes(finalStatus)) {
    return res.status(400).json({ error: "status inválido. Use 'coming' ou 'absent'." })
  }
  // Horário só faz sentido quando vai ao escritório.
  const finalArrival = finalStatus === 'coming' ? (arrival_time || null) : null
  try {
    const { rows } = await query(
      `INSERT INTO presences (user_id, date, status, arrival_time, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date)
       DO UPDATE SET status = EXCLUDED.status,
                     arrival_time = EXCLUDED.arrival_time,
                     reason = EXCLUDED.reason
       RETURNING id, user_id, date, status, arrival_time, reason`,
      [req.profile.id, date, finalStatus, finalArrival, reason?.trim() || null]
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Remove a própria marcação de um dia.
router.delete('/presences/:date', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM presences WHERE user_id = $1 AND date = $2', [
      req.profile.id,
      req.params.date,
    ])
    return res.status(204).end()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
