import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireApprover } from '../middleware/requireApprover.js'
import { adminClient } from '../lib/supabase.js'
import { isAdmin, isAdministrativeIntern } from '../lib/permissions.js'

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
  const { data, error } = await adminClient
    .from('vacation_requests')
    .select('id')
    .eq('user_id', userId)
    .in('status', ACTIVE_VACATION_STATUSES)
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1)

  if (error) throw error
  return (data || []).length > 0
}

async function enrichVacationRequests(vacations) {
  const rows = vacations || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((vacation) => vacation.user_id).filter(Boolean))]

  const { data: profiles, error } = userIds.length
    ? await adminClient
      .from('profiles')
      .select('id, name, email, position, avatar_url, role')
      .in('id', userIds)
    : { data: [], error: null }

  if (error) throw error

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  return rows.map((vacation) => ({
    ...vacation,
    profile: profileMap.get(vacation.user_id) || null,
  }))
}

function mapVacationError(error) {
  if (!error?.message) return 'Erro ao processar solicitação de férias.'
  if (error.message.includes('vacation_requests_no_user_overlap')) {
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

  const { data, error } = await adminClient
    .from('vacation_requests')
    .select('id, user_id, start_date, end_date, days_count')
    .eq('status', 'approved')
    .lte('start_date', endDate.value)
    .gte('end_date', startDate.value)
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })

  try {
    const enriched = await enrichVacationRequests(data || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── COLABORADOR: FÉRIAS ─────────────────────────────────────────────
router.get('/me/vacation-requests', requireAuth, async (req, res) => {
  const status = req.query.status

  let query = adminClient
    .from('vacation_requests')
    .select('id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_at, created_at, updated_at')
    .eq('user_id', req.profile.id)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

router.post('/me/vacation-requests', requireAuth, async (req, res) => {
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
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const isAdminRequest = isAdmin(req.profile)
  const decidedAt = isAdminRequest ? new Date().toISOString() : null

  const { data, error } = await adminClient
    .from('vacation_requests')
    .insert([{
      user_id: req.profile.id,
      ...parsed.data,
      status: isAdminRequest ? 'approved' : 'pending',
      decided_by: isAdminRequest ? req.profile.id : null,
      decided_at: decidedAt,
      updated_at: decidedAt || undefined,
    }])
    .select()
    .single()

  if (error) return res.status(400).json({ error: mapVacationError(error) })
  return res.status(201).json(data)
})

router.delete('/me/vacation-requests/:id', requireAuth, async (req, res) => {
  const { data, error } = await adminClient
    .from('vacation_requests')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.profile.id)
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
  }

  return res.json(data)
})

// ─── ADMIN: FÉRIAS ───────────────────────────────────────────────────
router.get('/admin/vacation-requests', requireAuth, requireApprover, async (req, res) => {
  const status = req.query.status || 'pending'

  let query = adminClient
    .from('vacation_requests')
    .select('id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_by, decided_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })

  try {
    const enriched = await enrichVacationRequests(data || [])
    const visibleRequests = isAdmin(req.profile)
      ? enriched
      : enriched.filter((vacation) => !isAdministrativeIntern(vacation.profile))
    return res.json(visibleRequests)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/vacation-requests/:id/approve', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  const { data: request, error: requestError } = await adminClient
    .from('vacation_requests')
    .select('id, user_id, status')
    .eq('id', req.params.id)
    .single()

  if (requestError || !request) {
    return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Esta solicitação já foi decidida.' })
  }

  const { data: targetProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', request.user_id)
    .single()

  if (profileError || !targetProfile) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' })
  }

  if (isAdministrativeIntern(targetProfile) && !isAdmin(req.profile)) {
    return res.status(403).json({
      error: 'Somente administradores podem aprovar férias de estagiários administrativos.',
    })
  }

  const { data, error } = await adminClient
    .from('vacation_requests')
    .update({
      status: 'approved',
      admin_note: adminNote,
      decided_by: req.profile.id,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Solicitação de férias pendente não encontrada.' })
  }

  return res.json(data)
})

router.post('/admin/vacation-requests/:id/reject', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  const { data: request, error: requestError } = await adminClient
    .from('vacation_requests')
    .select('id, user_id, status')
    .eq('id', req.params.id)
    .single()

  if (requestError || !request) {
    return res.status(404).json({ error: 'Solicitação de férias não encontrada.' })
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Esta solicitação já foi decidida.' })
  }

  const { data: targetProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', request.user_id)
    .single()

  if (profileError || !targetProfile) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' })
  }

  if (isAdministrativeIntern(targetProfile) && !isAdmin(req.profile)) {
    return res.status(403).json({
      error: 'Somente administradores podem rejeitar férias de estagiários administrativos.',
    })
  }

  const { data, error } = await adminClient
    .from('vacation_requests')
    .update({
      status: 'rejected',
      admin_note: adminNote,
      decided_by: req.profile.id,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Solicitação de férias pendente não encontrada.' })
  }

  return res.json(data)
})

export default router
