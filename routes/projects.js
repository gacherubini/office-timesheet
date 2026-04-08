import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { createUserClient, adminClient } from '../lib/supabase.js'

const router = Router()

router.get('/projects', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)

  const { data, error } = await userClient
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

router.post('/projects', requireAuth, requireAdmin, async (req, res) => {
  const { name, client, status = 'active' } = req.body

  const { data, error } = await adminClient
    .from('projects')
    .insert([{ name, client, status }])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

export default router