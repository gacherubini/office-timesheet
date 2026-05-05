import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { adminClient } from '../lib/supabase.js'
import { canDeleteSuppliers, canManageSuppliers } from '../lib/permissions.js'

const router = Router()

function optionalText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

function parseSupplierPayload(body = {}) {
  const name = optionalText(body.name)

  if (!name) return { error: 'Nome é obrigatório.' }

  return {
    data: {
      name,
      category: optionalText(body.category),
      email: optionalText(body.email),
      phone: optionalText(body.phone),
      notes: optionalText(body.notes),
    },
  }
}

function requireCanManageSuppliers(req, res, next) {
  if (!canManageSuppliers(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a fornecedores.' })
  }

  return next()
}

function requireCanDeleteSuppliers(req, res, next) {
  if (!canDeleteSuppliers(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito à exclusão de fornecedores.' })
  }

  return next()
}

router.get('/admin/suppliers', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const q = req.query.q?.trim()

  let query = adminClient
    .from('suppliers')
    .select('id, name, category, email, phone, notes, created_at, updated_at')
    .order('name', { ascending: true })

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })

  return res.json(data || [])
})

router.post('/admin/suppliers', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const parsed = parseSupplierPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data, error } = await adminClient
    .from('suppliers')
    .insert([parsed.data])
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.put('/admin/suppliers/:id', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const parsed = parseSupplierPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data, error } = await adminClient
    .from('suppliers')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Fornecedor não encontrado.' })
  }

  return res.json(data)
})

router.delete('/admin/suppliers/:id', requireAuth, requireCanDeleteSuppliers, async (req, res) => {
  const { error } = await adminClient.from('suppliers').delete().eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Fornecedor excluído com sucesso.' })
})

export default router
