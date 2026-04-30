import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { createUserClient, adminClient } from '../lib/supabase.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Apenas imagens são permitidas.'))
    }
  },
})

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
  const { name, client, status = 'active', sale_value = 0 } = req.body

  if (sale_value !== undefined && Number(sale_value) < 0) {
    return res.status(400).json({ error: 'Valor de venda não pode ser negativo.' })
  }

  const { data, error } = await adminClient
    .from('projects')
    .insert([{ name, client, status, sale_value: Number(sale_value) || 0 }])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

// ─── EDITAR PROJETO ───────────────────────────────────────────────────
router.put('/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { name, client, status, sale_value } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (client !== undefined) updates.client = client.trim()
  if (sale_value !== undefined) {
    if (Number(sale_value) < 0) {
      return res.status(400).json({ error: 'Valor de venda não pode ser negativo.' })
    }
    updates.sale_value = Number(sale_value) || 0
  }
  if (status !== undefined) {
    if (!['active', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use "active" ou "completed".' })
    }
    updates.status = status
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  const { data, error } = await adminClient
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

// ─── EXCLUIR PROJETO ──────────────────────────────────────────────────
router.delete('/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  // Verifica se existem apontamentos vinculados ao projeto
  const { count, error: countError } = await adminClient
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)

  if (countError) {
    return res.status(400).json({ error: countError.message })
  }

  if (count > 0) {
    return res.status(409).json({
      error: `Projeto possui ${count} apontamento(s). Não é possível excluir. Considere alterar o status para "completed".`,
    })
  }

  const { error } = await adminClient
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json({ message: 'Projeto excluído com sucesso.' })
})

// ─── UPLOAD DE IMAGEM DO PROJETO ──────────────────────────────────────
router.post('/projects/:id/image', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  // Verifica se o projeto existe
  const { data: project, error: projectError } = await adminClient
    .from('projects')
    .select('id, image_url')
    .eq('id', id)
    .single()

  if (projectError || !project) {
    return res.status(404).json({ error: 'Projeto não encontrado.' })
  }

  // Se já tinha imagem, remove a antiga do storage
  if (project.image_url) {
    const oldPath = project.image_url.split('/project-images/')[1]
    if (oldPath) {
      await adminClient.storage.from('project-images').remove([oldPath])
    }
  }

  // Upload para o Supabase Storage
  const ext = req.file.originalname.split('.').pop()
  const fileName = `${id}-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from('project-images')
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    })

  if (uploadError) {
    return res.status(400).json({ error: uploadError.message })
  }

  // Gera URL pública
  const { data: urlData } = adminClient.storage
    .from('project-images')
    .getPublicUrl(fileName)

  const imageUrl = urlData.publicUrl

  // Salva a URL no banco
  const { data, error } = await adminClient
    .from('projects')
    .update({ image_url: imageUrl })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

export default router