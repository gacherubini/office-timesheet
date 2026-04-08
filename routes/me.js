import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: req.authUser,
    profile: req.profile,
  })
})

export default router