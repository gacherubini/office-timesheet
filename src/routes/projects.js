import { Router } from 'express'
import multer from 'multer'
import { query } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireOperationalAccess } from '../middleware/requireOperationalAccess.js'

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
  try {
    const { rows } = await query(
      `SELECT id, name, client, status, image_url, created_at, updated_at
       FROM projects
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    )
    return res.json(rows)
  } catch (err) {
    console.error('Erro em GET /projects:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.get('/projects/deleted', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, client, status, image_url, deleted_at, created_at
       FROM projects
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
    )
    return res.json(rows || [])
  } catch (err) {
    console.error('Erro em GET /projects/deleted:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects', requireAuth, requireOperationalAccess, async (req, res) => {
  const { name, client, status = 'active' } = req.body

  try {
    const { rows } = await query(
      `INSERT INTO projects (name, client, status, sale_value)
       VALUES ($1, $2, $3, 0)
       RETURNING id, name, client, status, image_url, created_at, updated_at`,
      [name, client, status],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    console.error('Erro em POST /projects:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.put('/projects/:id', requireAuth, requireOperationalAccess, async (req, res) => {
  const { id } = req.params
  const { name, client, status } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (client !== undefined) updates.client = client.trim()
  if (status !== undefined) {
    if (!['active', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use "active" ou "completed".' })
    }
    updates.status = status
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  try {
    const setClauses = []
    const values = []
    let paramCount = 1

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    values.push(id)
    const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING id, name, client, status, image_url, created_at, updated_at`

    const { rows } = await query(sql, values)

    if (!rows[0]) {
      return res.status(404).json({ error: 'Projeto não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em PUT /projects/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  try {
    const { rows } = await query(
      `UPDATE projects SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, name, client, status, image_url, created_at`,
      [id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Projeto excluído não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em POST /projects/:id/restore:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  try {
    const { rows } = await query(
      `UPDATE projects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Projeto não encontrado ou já excluído.' })
    }

    return res.status(204).send()
  } catch (err) {
    console.error('Erro em DELETE /projects/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects/:id/image', requireAuth, requireOperationalAccess, upload.single('image'), async (req, res) => {
  const { id } = req.params

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  try {
    const { rows: projectRows } = await query(
      'SELECT id, image_url FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [id],
    )

    if (!projectRows[0]) {
      return res.status(404).json({ error: 'Projeto não encontrado.' })
    }

    const project = projectRows[0]

    // Deletar imagem antiga se existir
    if (project.image_url) {
      const oldKey = extractKeyFromUrl(project.image_url)
      if (oldKey) {
        await deleteFile(oldKey)
      }
    }

    // Upload nova imagem
    const { url } = await uploadFile('projects', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    // Atualizar projeto com nova URL
    const { rows } = await query(
      `UPDATE projects
       SET image_url = $1
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, name, client, status, image_url, created_at, updated_at`,
      [url, id],
    )

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em POST /projects/:id/image:', err)
    return res.status(400).json({ error: err.message })
  }
})

export default router
