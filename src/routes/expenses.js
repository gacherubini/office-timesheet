import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireApprover } from '../middleware/requireApprover.js'
import { query } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
    if (allowed) cb(null, true)
    else cb(new Error('Comprovante deve ser imagem ou PDF.'))
  },
})

function parseExpensePayload(body) {
  const title = body.title?.trim()
  const description = body.description?.trim() || null
  const amount = Number(body.amount)
  const expenseDate = body.expense_date

  if (!title) {
    return { error: 'Título é obrigatório.' }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valor da despesa deve ser maior que zero.' }
  }

  if (!expenseDate || Number.isNaN(new Date(`${expenseDate}T00:00:00`).getTime())) {
    return { error: 'Data da despesa inválida.' }
  }

  return {
    data: {
      title,
      description,
      amount: Number(amount.toFixed(2)),
      expense_date: expenseDate,
    },
  }
}

async function enrichExpenseRequests(expenses) {
  const rows = expenses || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((expense) => expense.user_id).filter(Boolean))]

  if (userIds.length === 0) return rows

  try {
    const { rows: profiles } = userIds.length
      ? await query('SELECT id, name, email, position, avatar_url FROM users WHERE id = ANY($1)', [userIds])
      : { rows: [] }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    return rows.map((expense) => ({
      ...expense,
      profile: profileMap.get(expense.user_id) || null,
    }))
  } catch (err) {
    throw err
  }
}

// ─── COLABORADOR: DESPESAS ───────────────────────────────────────────
router.get('/me/expense-requests', requireAuth, async (req, res) => {
  if (req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a despesas administrativas.' })
  }

  const status = req.query.status

  try {
    let sql = `SELECT id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_at, created_at, updated_at
               FROM expense_requests
               WHERE user_id = $1`
    const params = [req.profile.id]

    if (status) {
      sql += ` AND status = $2`
      params.push(status)
    }

    sql += ` ORDER BY expense_date DESC, created_at DESC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/me/expense-requests', requireAuth, upload.single('receipt'), async (req, res) => {
  if (req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a despesas administrativas.' })
  }

  const parsed = parseExpensePayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  let receiptUrl = null

  try {
    if (req.file) {
      const { url } = await uploadFile('receipts', req.file)
      receiptUrl = url
    }

    const { rows } = await query(
      `INSERT INTO expense_requests (user_id, title, description, amount, expense_date, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_at, created_at, updated_at`,
      [req.profile.id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.expense_date, receiptUrl]
    )

    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: DESPESAS ─────────────────────────────────────────────────
router.get('/admin/expense-requests', requireAuth, requireApprover, async (req, res) => {
  const status = req.query.status || 'pending'

  try {
    let sql = `SELECT id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_by, decided_at, created_at, updated_at
               FROM expense_requests`
    const params = []

    if (status !== 'all') {
      sql += ` WHERE status = $1`
      params.push(status)
    }

    sql += ` ORDER BY created_at DESC`

    const { rows } = await query(sql, params)

    const enriched = await enrichExpenseRequests(rows || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/expense-requests/:id/approve', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  try {
    const { rows } = await query(
      `UPDATE expense_requests
       SET status = 'approved', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_by, decided_at, created_at, updated_at`,
      [adminNote, req.profile.id, decidedAt, req.params.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Despesa pendente não encontrada.' })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/expense-requests/:id/reject', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  try {
    const { rows } = await query(
      `UPDATE expense_requests
       SET status = 'rejected', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_by, decided_at, created_at, updated_at`,
      [adminNote, req.profile.id, decidedAt, req.params.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Despesa pendente não encontrada.' })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/admin/expense-requests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM expense_requests WHERE id = $1 RETURNING receipt_url',
      [req.params.id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada.' })
    }

    const receiptUrl = rows[0].receipt_url
    if (receiptUrl) {
      const key = extractKeyFromUrl(receiptUrl)
      if (key) await deleteFile(key)
    }

    return res.json({ message: 'Despesa excluída com sucesso.' })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
