import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { adminClient } from '../lib/supabase.js'

const router = Router()

router.post('/time-entries/start', requireAuth, async (req, res) => {
  const { projectId } = req.body

  if (!projectId) {
    return res.status(400).json({ error: 'projectId é obrigatório.' })
  }

  const userId = req.profile.id

  const { data: project, error: projectError } = await adminClient
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return res.status(404).json({ error: 'Projeto não encontrado.' })
  }

  if (project.status !== 'active') {
    return res.status(400).json({ error: 'Projeto não está ativo.' })
  }

  const { data: openEntry, error: openEntryError } = await adminClient
    .from('time_entries')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['running', 'paused'])
    .maybeSingle()

  if (openEntryError) {
    return res.status(400).json({ error: openEntryError.message })
  }

  if (openEntry) {
    return res.status(409).json({ error: 'Já existe um apontamento aberto.' })
  }

  const { data, error } = await adminClient
    .from('time_entries')
    .insert([
      {
        user_id: userId,
        project_id: projectId,
        started_at: new Date().toISOString(),
        status: 'running',
      },
    ])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

export default router