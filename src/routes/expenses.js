import { Router } from 'express'
import crypto from 'crypto'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireApprover } from '../middleware/requireApprover.js'
import { adminClient } from '../lib/supabase.js'

const router = Router()
const receiptBucket = 'expense-receipts'

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
  const receiptUrl = body.receipt_url?.trim() || null
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
      receipt_url: receiptUrl,
    },
  }
}

async function uploadReceiptFile(file, userId) {
  if (!file) return null

  const ext = file.originalname.split('.').pop() || 'file'
  const fileName = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from(receiptBucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (uploadError) throw uploadError

  const { data: urlData } = adminClient.storage
    .from(receiptBucket)
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

async function enrichExpenseRequests(expenses) {
  const rows = expenses || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((expense) => expense.user_id).filter(Boolean))]

  const { data: profiles, error } = userIds.length
    ? await adminClient
      .from('profiles')
      .select('id, name, email, position, avatar_url')
      .in('id', userIds)
    : { data: [], error: null }

  if (error) throw error

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  return rows.map((expense) => ({
    ...expense,
    profile: profileMap.get(expense.user_id) || null,
  }))
}

// ─── COLABORADOR: DESPESAS ───────────────────────────────────────────
router.get('/me/expense-requests', requireAuth, async (req, res) => {
  if (req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a despesas administrativas.' })
  }

  const status = req.query.status

  let query = adminClient
    .from('expense_requests')
    .select('id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_at, created_at, updated_at')
    .eq('user_id', req.profile.id)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

router.post('/me/expense-requests', requireAuth, upload.single('receipt'), async (req, res) => {
  if (req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a despesas administrativas.' })
  }

  const parsed = parseExpensePayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  let receiptUrl = parsed.data.receipt_url

  try {
    const uploadedReceiptUrl = await uploadReceiptFile(req.file, req.profile.id)
    if (uploadedReceiptUrl) receiptUrl = uploadedReceiptUrl
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data, error } = await adminClient
    .from('expense_requests')
    .insert([{
      user_id: req.profile.id,
      ...parsed.data,
      receipt_url: receiptUrl,
    }])
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

// ─── ADMIN: DESPESAS ─────────────────────────────────────────────────
router.get('/admin/expense-requests', requireAuth, requireApprover, async (req, res) => {
  const status = req.query.status || 'pending'

  let query = adminClient
    .from('expense_requests')
    .select('id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_by, decided_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query

  if (error) return res.status(400).json({ error: error.message })

  try {
    const enriched = await enrichExpenseRequests(data || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/expense-requests/:id/approve', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  const { data, error } = await adminClient
    .from('expense_requests')
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
    return res.status(404).json({ error: 'Despesa pendente não encontrada.' })
  }

  return res.json(data)
})

router.post('/admin/expense-requests/:id/reject', requireAuth, requireApprover, async (req, res) => {
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  const { data, error } = await adminClient
    .from('expense_requests')
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
    return res.status(404).json({ error: 'Despesa pendente não encontrada.' })
  }

  return res.json(data)
})

export default router
