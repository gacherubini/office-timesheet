import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireOperationalAccess } from '../middleware/requireOperationalAccess.js'
import { adminClient } from '../lib/supabase.js'

const router = Router()

function optionalText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

function parseClientPayload(body = {}) {
  const name = optionalText(body.name)

  if (!name) return { error: 'Nome é obrigatório.' }

  return {
    data: {
      name,
      email: optionalText(body.email),
      phone: optionalText(body.phone),
      notes: optionalText(body.notes),
    },
  }
}

router.get('/admin/clients', requireAuth, requireOperationalAccess, async (req, res) => {
  const q = req.query.q?.trim()

  let query = adminClient
    .from('clients')
    .select('id, name, email, phone, notes, created_at, updated_at')
    .order('name', { ascending: true })

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })

  return res.json(data || [])
})

router.post('/admin/clients', requireAuth, requireOperationalAccess, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data, error } = await adminClient
    .from('clients')
    .insert([parsed.data])
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
})

router.put('/admin/clients/:id', requireAuth, requireOperationalAccess, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const { data, error } = await adminClient
    .from('clients')
    .update(parsed.data)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Cliente não encontrado.' })
  }

  return res.json(data)
})

router.delete('/admin/clients/:id', requireAuth, requireOperationalAccess, async (req, res) => {
  const { error } = await adminClient.from('clients').delete().eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Cliente excluído com sucesso.' })
})

export default router
