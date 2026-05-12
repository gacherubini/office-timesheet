import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'
import {
  canApproveVacationRequest,
  canAutoApproveOwnVacationRequest,
  canCreateOwnVacationRequest,
  canDeleteOwnVacationRequest,
  canViewVacationApprovals,
  isAdmin,
} from '../lib/permissions.js'

const router = Router()
const ACTIVE_VACATION_STATUSES = ['pending', 'approved']

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const utcTime = Date.UTC(year, month - 1, day)
  const date = new Date(utcTime)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { value, utcTime }
}

function todayValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateInclusiveDays(startUtcTime, endUtcTime) {
  return Math.round((endUtcTime - startUtcTime) / 86400000) + 1
}

function parseVacationPayload(body) {
  const startDate = parseDateOnly(body.start_date)
  const endDate = parseDateOnly(body.end_date)
  const reason = body.reason?.trim() || null

  if (!startDate) return { error: 'Data de início inválida.' }
  if (!endDate) return { error: 'Data de fim inválida.' }

  if (endDate.utcTime < startDate.utcTime) {
    return { error: 'Data de fim deve ser igual ou posterior ao início.' }
  }

  if (startDate.value < todayValue()) {
    return { error: 'Solicitações de férias não podem começar no passado.' }
  }

  return {
    data: {
      start_date: startDate.value,
      end_date: endDate.value,
      days_count: calculateInclusiveDays(startDate.utcTime, endDate.utcTime),
      reason,
    },
  }
}

async function hasOverlappingVacation(userId, startDate, endDate) {
  try {
    const { rows } = await query(
      `SELECT id FROM vacation_requests
       WHERE user_id = $1
         AND status = ANY($2)
         AND daterange(start_date::date, end_date::date, '[]') && daterange($3::date, $4::date, '[]')
       LIMIT 1`,
      [userId, ACTIVE_VACATION_STATUSES, startDate, endDate]
    )
    return rows.length > 0
  } catch (err) {
    throw err
  }
}

async function enrichVacationRequests(vacations) {
  const rows = vacations || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((vacation) => vacation.user_id).filter(Boolean))]

  if (userIds.length === 0) return rows

  try {
    const { rows: profiles } = userIds.length
      ? await query('SELECT id, name, email, position, avatar_url, role FROM users WHERE id = ANY($1)', [userIds])
      : { rows: [] }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    return rows.map((vacation) => ({
      ...vacation,
      profile: profileMap.get(vacation.user_id) || null,
    }))
  } catch (err) {
    throw err
  }
}

function mapVacationError(error) {
  if (!error?.message) return 'Erro ao processar solicitação de férias.'
  if (error.code === '23505' || error.message.includes('overlap')) {
    return 'Já existe uma solicitação de férias pendente ou aprovada nesse período.'
  }
  return error.message
}

// ─── TODOS: CALENDÁRIO DE FÉRIAS ─────────────────────────────────────
router.get('/vacation-calendar', requireAuth, async (req, res) => {
  const startDate = parseDateOnly(req.query.start_date)
  const endDate = parseDateOnly(req.query.end_date)

  if (!startDate) return res.status(400).json({ error: 'Data inicial inválida.' })
  if (!endDate) return res.status(400).json({ error: 'Data final inválida.' })

  if (endDate.utcTime < startDate.utcTime) {
    return res.status(400).json({ error: 'Data final deve ser igual ou posterior à inicial.' })
  }

  try {
    const { rows } = await query(
      `SELECT id, user_id, start_date, end_date, days_count
       FROM vacation_requests
       WHERE status = 'approved'
         AND start_date <= $1::date AND end_date >= $2::date
       ORDER BY start_date ASC, created_at ASC`,
      [endDate.value, startDate.value]
    )

    const enriched = await enrichVacationRequests(rows || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── COLABORADOR: FÉRIAS ─────────────────────────────────────────────
router.get('/me/vacation-requests', requireAuth, async (req, res) => {
  if (!canCreateOwnVacationRequest(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a solicitações de férias.' })
  }

  const status = req.query.status

  try {
    let sql = `SELECT id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_at, created_at, updated_at
               FROM vacation_requests
               WHERE user_id = $1`
    const params = [req.profile.id]

    if (status) {
      sql += ` AND status = $2`
      params.push(status)
    }

    sql += ` ORDER BY start_date DESC, created_at DESC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/me/vacation-requests', requireAuth, async (req, res) => {
  if (!canCreateOwnVacationRequest(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a solicitações de férias.' })
  }

  const parsed = parseVacationPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const overlapping = await hasOverlappingVacation(
      req.profile.id,
      parsed.data.start_date,
      parsed.data.end_date,
    )

    if (overlapping) {
      return res.status(409).json({
        error: 'Já existe uma solicitação de férias pendente ou aprovada nesse período.',
      })
    }

    const shouldAutoApprove = canAutoApproveOwnVacationRequest(req.profile)
    const decidedAt = shouldAutoApprove ? new Date().toISOString() : null

    const { rows } = await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, reason, status, decided_by, decided_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_at, created_at, updated_at`,
      [
        req.profile.id,
        parsed.data.start_date,
        parsed.data.end_date,
        parsed.data.days_count,
        parsed.data.reason,
        shouldAutoApprove ? 'approved' : 'pending',
        shouldAutoApprove ? req.profile.id : null,
        decidedAt,
        decidedAt || new Date().toISOString(),
      ]
    )

    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: mapVacationError(err) })
  }
})

router.delete('/me/vacation-requests/:id', requireAuth, async (req, res) => {
  if (!canDeleteOwnVacationRequest(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a solicitações de férias.' })
  }

  try {
    const { rows } = await query(
      `DELETE FROM vacation_requests
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_at, created_at, updated_at`,
      [req.params.id, req.profile.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: FÉRIAS ───────────────────────────────────────────────────
function requireCanViewVacationApprovals(req, res, next) {
  if (!canViewVacationApprovals(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a aprovações de férias.' })
  }

  return next()
}

router.get('/admin/vacation-requests', requireAuth, requireCanViewVacationApprovals, async (req, res) => {
  const status = req.query.status || 'pending'

  try {
    let sql = `SELECT id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_by, decided_at, created_at, updated_at
               FROM vacation_requests`
    const params = []

    if (status !== 'all') {
      sql += ` WHERE status = $1`
      params.push(status)
    }

    sql += ` ORDER BY created_at DESC`

    const { rows } = await query(sql, params)

    const enriched = await enrichVacationRequests(rows || [])
    const visibleRequests = isAdmin(req.profile)
      ? enriched
      : enriched.filter((vacation) => canApproveVacationRequest(req.profile, vacation.profile))
    return res.json(visibleRequests)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/vacation-requests/:id/approve', requireAuth, requireCanViewVacationApprovals, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  try {
    const { rows: requestRows } = await query(
      'SELECT id, user_id, status FROM vacation_requests WHERE id = $1',
      [req.params.id]
    )

    if (!requestRows || requestRows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
    }

    const vacationRequest = requestRows[0]

    if (vacationRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Esta solicitação já foi decidida.' })
    }

    const { rows: targetProfileRows } = await query(
      'SELECT role FROM users WHERE id = $1',
      [vacationRequest.user_id]
    )

    if (!targetProfileRows || targetProfileRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado.' })
    }

    const targetProfile = targetProfileRows[0]

    // Verifica permissões
    if (!isAdmin(req.profile) && !canApproveVacationRequest(req.profile, targetProfile)) {
      return res.status(403).json({ error: 'Você não tem permissão para aprovar esta solicitação.' })
    }

    const { rows } = await query(
      `UPDATE vacation_requests
       SET status = 'approved', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
       WHERE id = $4
       RETURNING id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_by, decided_at, created_at, updated_at`,
      [adminNote, req.profile.id, decidedAt, req.params.id]
    )

    const enriched = await enrichVacationRequests(rows)
    return res.json(enriched[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/vacation-requests/:id/reject', requireAuth, requireCanViewVacationApprovals, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  try {
    const { rows: requestRows } = await query(
      'SELECT id, user_id, status FROM vacation_requests WHERE id = $1',
      [req.params.id]
    )

    if (!requestRows || requestRows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
    }

    const vacationRequest = requestRows[0]

    if (vacationRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Esta solicitação já foi decidida.' })
    }

    const { rows: targetProfileRows } = await query(
      'SELECT role FROM users WHERE id = $1',
      [vacationRequest.user_id]
    )

    if (!targetProfileRows || targetProfileRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado.' })
    }

    const targetProfile = targetProfileRows[0]

    // Verifica permissões
    if (!isAdmin(req.profile) && !canApproveVacationRequest(req.profile, targetProfile)) {
      return res.status(403).json({ error: 'Você não tem permissão para rejeitar esta solicitação.' })
    }

    const { rows } = await query(
      `UPDATE vacation_requests
       SET status = 'rejected', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
       WHERE id = $4
       RETURNING id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_by, decided_at, created_at, updated_at`,
      [adminNote, req.profile.id, decidedAt, req.params.id]
    )

    const enriched = await enrichVacationRequests(rows)
    return res.json(enriched[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Admin: deletar férias de qualquer usuário, em qualquer status
router.delete('/admin/vacation-requests/:id', requireAuth, requireCanViewVacationApprovals, async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM vacation_requests
       WHERE id = $1
       RETURNING id, user_id, start_date, end_date, days_count, status`,
      [req.params.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
