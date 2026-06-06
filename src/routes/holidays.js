import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getHolidays } from '../lib/holidays.js'

const router = Router()

// Feriados nacionais de um ano (default = ano atual).
router.get('/holidays', requireAuth, async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear()
  try {
    const holidays = await getHolidays(year)
    return res.json(holidays)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
