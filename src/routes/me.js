import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createUserClient } from '../lib/supabase.js'

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

export default router