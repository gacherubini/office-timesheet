import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { createUserClient, adminClient } from '../lib/supabase.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Apenas imagens são permitidas.'))
  },
})

const profileFields = 'id, name, email, role, is_active, position, birth_date, phone, avatar_url, monthly_income_goal, created_at'

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: req.authUser,
    profile: req.profile,
  })
})

router.get('/me/profile', requireAuth, async (req, res) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select(profileFields)
    .eq('id', req.profile.id)
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

router.put('/me/profile', requireAuth, async (req, res) => {
  const { name, phone, birth_date, monthly_income_goal } = req.body

  const updates = {}
  if (name !== undefined) {
    const trimmedName = name.trim()
    if (!trimmedName) return res.status(400).json({ error: 'Nome é obrigatório.' })
    updates.name = trimmedName
  }
  if (phone !== undefined) updates.phone = phone?.trim() || null
  if (birth_date !== undefined) updates.birth_date = birth_date || null
  if (monthly_income_goal !== undefined) {
    const goal = Number(monthly_income_goal)
    if (!Number.isFinite(goal) || goal < 0) {
      return res.status(400).json({ error: 'Meta financeira deve ser maior ou igual a zero.' })
    }
    updates.monthly_income_goal = Number(goal.toFixed(2))
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  const { data, error } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', req.profile.id)
    .select(profileFields)
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

router.post('/me/profile/avatar', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, avatar_url')
    .eq('id', req.profile.id)
    .single()

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Perfil não encontrado.' })
  }

  if (profile.avatar_url) {
    const oldPath = profile.avatar_url.split('/user-avatars/')[1]
    if (oldPath) await adminClient.storage.from('user-avatars').remove([oldPath])
  }

  const ext = req.file.originalname.split('.').pop()
  const fileName = `${req.profile.id}-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from('user-avatars')
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    })

  if (uploadError) return res.status(400).json({ error: uploadError.message })

  const { data: urlData } = adminClient.storage
    .from('user-avatars')
    .getPublicUrl(fileName)

  const { data, error } = await adminClient
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', req.profile.id)
    .select(profileFields)
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

// ─── HISTÓRICO DO COLABORADOR ─────────────────────────────────────────
router.get('/me/history', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))
  const offset = (page - 1) * limit

  const query = userClient
    .from('time_entries')
    .select('id, project_id, started_at, ended_at, duration_minutes, status, projects(name, client)', { count: 'exact' })
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json({
    data,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
    },
  })
})

// ─── SOLICITAÇÕES DE ALTERAÇÃO DE PONTO (COLABORADOR) ────────────────
router.get('/me/time-entry-change-requests', requireAuth, async (req, res) => {
  const userId = req.profile.id
  const status = req.query.status

  let query = adminClient
    .from('time_entry_change_requests')
    .select('id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

router.post('/me/time-entry-change-requests', requireAuth, async (req, res) => {
  const userId = req.profile.id
  const {
    time_entry_id,
    requested_project_id,
    requested_started_at,
    requested_ended_at,
    reason,
  } = req.body

  if (!time_entry_id || !requested_project_id || !requested_started_at || !requested_ended_at) {
    return res.status(400).json({
      error: 'Apontamento, projeto, início e saída solicitados são obrigatórios.',
    })
  }

  const trimmedReason = reason?.trim()
  if (!trimmedReason) {
    return res.status(400).json({ error: 'Informe o motivo da solicitação.' })
  }

  const requestedStart = new Date(requested_started_at)
  const requestedEnd = new Date(requested_ended_at)

  if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    return res.status(400).json({ error: 'Datas inválidas.' })
  }

  if (requestedEnd <= requestedStart) {
    return res.status(400).json({ error: 'A saída deve ser posterior ao início.' })
  }

  const { data: entry, error: entryError } = await adminClient
    .from('time_entries')
    .select('id, user_id, status')
    .eq('id', time_entry_id)
    .eq('user_id', userId)
    .single()

  if (entryError || !entry) {
    return res.status(404).json({ error: 'Apontamento não encontrado.' })
  }

  if (entry.status !== 'completed') {
    return res.status(400).json({ error: 'Somente apontamentos finalizados podem ser alterados.' })
  }

  const { data: project, error: projectError } = await adminClient
    .from('projects')
    .select('id')
    .eq('id', requested_project_id)
    .single()

  if (projectError || !project) {
    return res.status(404).json({ error: 'Projeto solicitado não encontrado.' })
  }

  const { data, error } = await adminClient
    .from('time_entry_change_requests')
    .insert([{
      time_entry_id,
      user_id: userId,
      requested_project_id,
      requested_started_at: requestedStart.toISOString(),
      requested_ended_at: requestedEnd.toISOString(),
      reason: trimmedReason,
    }])
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma solicitação pendente para este apontamento.' })
    }
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

// ─── STATS DO COLABORADOR (KPIs do mês) ──────────────────────────────
router.get('/me/stats', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  const now = new Date()
  let year, month
  if (req.query.month) {
    ;[year, month] = req.query.month.split('-').map(Number)
  } else {
    year = now.getFullYear()
    month = now.getMonth() + 1
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const todayStr = now.toISOString().slice(0, 10)

  const { data: entries, error } = await userClient
    .from('time_entries')
    .select('id, duration_minutes, cost_snapshot, project_id, started_at, projects(id, name, image_url)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', startDate)
    .lte('started_at', endDate + 'T23:59:59')

  if (error) return res.status(400).json({ error: error.message })

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('hourly_rate, monthly_income_goal')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return res.status(400).json({ error: 'Perfil não encontrado para cálculo da perspectiva.' })
  }

  const total_minutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0)
  const total_cost = entries.reduce((sum, e) => sum + (e.cost_snapshot || 0), 0)
  const hourly_rate = Number(profile.hourly_rate) || 0
  const monthly_income_goal = Number(profile.monthly_income_goal) || 0

  const workingDaysSet = new Set(entries.map((e) => e.started_at.slice(0, 10)))
  const working_days = workingDaysSet.size
  const dailyTotalsMap = {}

  for (const entry of entries) {
    const date = entry.started_at.slice(0, 10)
    dailyTotalsMap[date] = (dailyTotalsMap[date] || 0) + (entry.duration_minutes || 0)
  }

  const avg_minutes_per_day = working_days > 0 ? Math.round(total_minutes / working_days) : 0
  const project_count = new Set(entries.map((e) => e.project_id)).size

  let business_days_in_month = 0
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) business_days_in_month++
  }
  const goal_minutes = business_days_in_month * 8 * 60
  const goal_amount_pct =
    monthly_income_goal > 0 ? Math.min(100, Math.round((total_cost / monthly_income_goal) * 100)) : 0
  const remaining_goal_amount = Math.max(0, monthly_income_goal - total_cost)
  const required_goal_minutes =
    hourly_rate > 0 ? Math.ceil((monthly_income_goal / hourly_rate) * 60) : 0
  const remaining_goal_minutes =
    hourly_rate > 0 ? Math.ceil((remaining_goal_amount / hourly_rate) * 60) : 0
  const projected_monthly_income =
    working_days > 0
      ? Number(((total_cost / working_days) * business_days_in_month).toFixed(2))
      : 0

  const projectMap = {}
  for (const entry of entries) {
    const pid = entry.project_id
    if (!projectMap[pid]) {
      projectMap[pid] = {
        project_id: pid,
        project_name: entry.projects?.name || 'Sem projeto',
        project_image: entry.projects?.image_url || null,
        total_minutes: 0,
        today_minutes: 0,
      }
    }
    projectMap[pid].total_minutes += entry.duration_minutes || 0
    if (entry.started_at.slice(0, 10) === todayStr) {
      projectMap[pid].today_minutes += entry.duration_minutes || 0
    }
  }

  return res.json({
    total_minutes,
    total_cost,
    hourly_rate,
    monthly_income_goal,
    goal_amount_pct,
    remaining_goal_amount,
    required_goal_minutes,
    remaining_goal_minutes,
    projected_monthly_income,
    working_days,
    avg_minutes_per_day,
    project_count,
    goal_minutes,
    business_days_in_month,
    year,
    month,
    daily_totals: Object.entries(dailyTotalsMap).map(([date, minutes]) => ({
      date,
      minutes,
    })),
    project_breakdown: Object.values(projectMap),
  })
})

// ─── ANIVERSARIANTES (compartilhado: admin e employee) ────────────────
router.get('/birthdays', requireAuth, async (_req, res) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, name, birth_date, avatar_url, phone, position')
    .is('deleted_at', null)
    .eq('is_active', true)
    .not('birth_date', 'is', null)

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
})

export default router
