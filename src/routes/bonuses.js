import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { adminClient } from '../lib/supabase.js'

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
  const { data: profiles, error } = userIds.length
    ? await adminClient
      .from('profiles')
      .select('id, name, email, position, avatar_url')
      .in('id', userIds)
    : { data: [], error: null }

  if (error) throw error

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))
  return list.map((bonus) => ({
    ...bonus,
    profile: profileMap.get(bonus.user_id) || null,
  }))
}

// ─── COLABORADOR: ver os próprios bônus ──────────────────────────
router.get('/me/bonuses', requireAuth, async (req, res) => {
  const { data, error } = await adminClient
    .from('bonuses')
    .select('id, user_id, title, description, amount, bonus_date, created_at, updated_at')
    .eq('user_id', req.profile.id)
    .order('bonus_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data || [])
})

// ─── ADMIN: listar bônus ─────────────────────────────────────────
router.get('/admin/bonuses', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, start_date, end_date } = req.query

  let query = adminClient
    .from('bonuses')
    .select('id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at')
    .order('bonus_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (user_id) query = query.eq('user_id', user_id)
  if (start_date) query = query.gte('bonus_date', start_date)
  if (end_date) query = query.lte('bonus_date', end_date)

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })

  try {
    const enriched = await enrichBonuses(data || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ADMIN: criar bônus ──────────────────────────────────────────
router.post('/admin/bonuses', requireAuth, requireAdmin, async (req, res) => {
  const parsed = parseBonusPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', parsed.data.user_id)
    .single()

  if (targetError || !targetProfile) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' })
  }

  const { data, error } = await adminClient
    .from('bonuses')
    .insert([{ ...parsed.data, created_by: req.profile.id }])
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

// ─── ADMIN: editar bônus ─────────────────────────────────────────
router.put('/admin/bonuses/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsed = parseBonusPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data, error } = await adminClient
    .from('bonuses')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Bônus não encontrado.' })
  }
  return res.json(data)
})

// ─── ADMIN: excluir bônus ────────────────────────────────────────
router.delete('/admin/bonuses/:id', requireAuth, requireAdmin, async (req, res) => {
  const { error } = await adminClient.from('bonuses').delete().eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ message: 'Bônus excluído com sucesso.' })
})

export default router
