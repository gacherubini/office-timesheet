import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Lista basica de usuarios ativos para pickers (responsavel, mencoes).
// Acessivel a qualquer usuario logado — nao expoe email nem campos financeiros.
router.get('/users/basic', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, avatar_url, position
         FROM users
        WHERE deleted_at IS NULL AND is_active = true
        ORDER BY name`
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
