import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createUserClient, adminClient } from '../lib/supabase.js'

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: req.authUser,
    profile: req.profile,
  })
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
    .select('id, started_at, ended_at, duration_minutes, status, projects(name, client)', { count: 'exact' })
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

  const total_minutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0)
  const total_cost = entries.reduce((sum, e) => sum + (e.cost_snapshot || 0), 0)

  const workingDaysSet = new Set(entries.map((e) => e.started_at.slice(0, 10)))
  const working_days = workingDaysSet.size

  const avg_minutes_per_day = working_days > 0 ? Math.round(total_minutes / working_days) : 0
  const project_count = new Set(entries.map((e) => e.project_id)).size

  let business_days_in_month = 0
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) business_days_in_month++
  }
  const goal_minutes = business_days_in_month * 8 * 60

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
    working_days,
    avg_minutes_per_day,
    project_count,
    goal_minutes,
    business_days_in_month,
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