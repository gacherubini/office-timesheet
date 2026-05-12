import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { query } from '../lib/db.js'

const router = Router()

function parseBonusPayload(body) {
  const userId = body.user_id?.trim()
  const title = body.title?.trim()
  const description = body.description?.trim() || null
  const amount = Number(body.amount)
  const bonusDate = body.bonus_date

  if (!userId) return { error: 'user_id é obrigatório.' }
  if (!title) return { error: 'Título é obrigatório.' }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valor do bônus deve ser maior que zero.' }
  }
  if (!bonusDate || Number.isNaN(new Date(`${bonusDate}T00:00:00`).getTime())) {
    return { error: 'Data do bônus inválida.' }
  }

  return {
    data: {
      user_id: userId,
      title,
      description,
      amount: Number(amount.toFixed(2)),
      bonus_date: bonusDate,
    },
  }
}

async function enrichBonuses(rows) {
  const list = rows || []
  if (list.length === 0) return []

  const userIds = [...new Set(list.map((b) => b.user_id).filter(Boolean))]

  if (userIds.length === 0) return list

  try {
    const { rows: profiles } = userIds.length
      ? await query('SELECT id, name, email, position, avatar_url FROM users WHERE id = ANY($1)', [userIds])
      : { rows: [] }

    const profileMap = new Map(profiles.map((p) => [p.id, p]))
    return list.map((bonus) => ({
      ...bonus,
      profile: profileMap.get(bonus.user_id) || null,
    }))
  } catch (err) {
    throw err
  }
}

// ─── COLABORADOR: ver os próprios bônus ──────────────────────────
router.get('/me/bonuses', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, user_id, title, description, amount, bonus_date, created_at, updated_at
       FROM bonuses
       WHERE user_id = $1
       ORDER BY bonus_date DESC, created_at DESC`,
      [req.profile.id]
    )
    return res.json(rows || [])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: listar bônus ─────────────────────────────────────────
router.get('/admin/bonuses', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, start_date, end_date } = req.query

  try {
    let sql = `SELECT id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at
               FROM bonuses`
    const params = []

    if (user_id || start_date || end_date) {
      const conditions = []
      if (user_id) {
        conditions.push(`user_id = $${params.length + 1}`)
        params.push(user_id)
      }
      if (start_date) {
        conditions.push(`bonus_date >= $${params.length + 1}::date`)
        params.push(start_date)
      }
      if (end_date) {
        conditions.push(`bonus_date <= $${params.length + 1}::date`)
        params.push(end_date)
      }
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ` ORDER BY bonus_date DESC, created_at DESC`

    const { rows } = await query(sql, params)

    const enriched = await enrichBonuses(rows || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: criar bônus ──────────────────────────────────────────
router.post('/admin/bonuses', requireAuth, requireAdmin, async (req, res) => {
  const parsed = parseBonusPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows: targetProfileRows } = await query(
      'SELECT id FROM users WHERE id = $1',
      [parsed.data.user_id]
    )

    if (!targetProfileRows || targetProfileRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado.' })
    }

    const { rows } = await query(
      `INSERT INTO bonuses (user_id, title, description, amount, bonus_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at`,
      [parsed.data.user_id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.bonus_date, req.profile.id]
    )

    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: editar bônus ─────────────────────────────────────────
router.put('/admin/bonuses/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsed = parseBonusPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows } = await query(
      `UPDATE bonuses
       SET user_id = $1, title = $2, description = $3, amount = $4, bonus_date = $5
       WHERE id = $6
       RETURNING id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at`,
      [parsed.data.user_id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.bonus_date, req.params.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Bônus não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: excluir bônus ────────────────────────────────────────
router.delete('/admin/bonuses/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM bonuses WHERE id = $1 RETURNING id', [req.params.id])

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Bônus não encontrado.' })
    }

    return res.json({ message: 'Bônus excluído com sucesso.' })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
