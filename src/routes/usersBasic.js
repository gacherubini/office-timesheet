import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { getCachedUsersBasic, setCachedUsersBasic } from '../lib/userCache.js'

const router = Router()

// Lista basica de usuarios ativos para pickers (responsavel, mencoes).
// Acessivel a qualquer usuario logado — nao expoe email nem campos financeiros.
// Cacheada em memoria (muda so quando usuarios sao criados/editados/removidos);
// invalidada nesses caminhos via lib/userCache.js.
router.get('/users/basic', requireAuth, async (_req, res) => {
  try {
    const cached = getCachedUsersBasic()
    if (cached) return res.json(cached)

    const { rows } = await query(
      `SELECT id, name, avatar_url, position
         FROM users
        WHERE deleted_at IS NULL AND is_active = true
        ORDER BY name`
    )
    setCachedUsersBasic(rows)
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
