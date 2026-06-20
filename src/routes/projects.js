import { Router } from 'express'
import multer from 'multer'
import { query, withTransaction } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'

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
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.created_at, p.updated_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
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
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.deleted_at, p.created_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.deleted_at IS NOT NULL
       ORDER BY p.deleted_at DESC`,
    )
    return res.json(rows || [])
  } catch (err) {
    console.error('Erro em GET /projects/deleted:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects', requireAuth, requireProjectManagement, async (req, res) => {
  const { name, client_id, address, start_date, template_id } = req.body

  // Status nasce sempre "active"; a evolução (concluído/excluído) é tratada
  // depois. Cliente vinculado e data de início são obrigatórios.
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Informe o nome do projeto.' })
  }
  if (!client_id) {
    return res.status(400).json({ error: 'Selecione um cliente para o projeto.' })
  }
  if (!start_date) {
    return res.status(400).json({ error: 'Informe a data de início.' })
  }

  try {
    const { rows: cli } = await query('SELECT name FROM clients WHERE id = $1', [client_id])
    if (!cli[0]) {
      return res.status(400).json({ error: 'Cliente não encontrado.' })
    }

    // Itens do template (se houver) — validados antes de abrir a transação.
    let templateItems = []
    if (template_id) {
      const { rows: tpl } = await query('SELECT id FROM project_templates WHERE id = $1', [template_id])
      if (!tpl[0]) {
        return res.status(400).json({ error: 'Template não encontrado.' })
      }
      const { rows: items } = await query(
        `SELECT title, description, priority FROM project_template_items
         WHERE template_id = $1 ORDER BY position, created_at`,
        [template_id],
      )
      templateItems = items
    }

    const project = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO projects (name, client, client_id, address, start_date, status, sale_value)
         VALUES ($1, $2, $3, $4, $5, 'active', 0)
         RETURNING id, name, client, client_id, address, start_date, status, image_url, created_at, updated_at`,
        [name.trim(), cli[0].name, client_id, address?.trim() || null, start_date],
      )
      const created = rows[0]

      // Gera as tarefas do template, em ordem, na coluna "A fazer".
      for (let i = 0; i < templateItems.length; i++) {
        const item = templateItems[i]
        await client.query(
          `INSERT INTO tasks (project_id, title, description, priority, status, position, created_by)
           VALUES ($1, $2, $3, $4::task_priority, 'todo', $5, $6)`,
          [created.id, item.title, item.description || null, item.priority || 'medium', i, req.profile.id],
        )
      }
      return created
    })

    return res.status(201).json(project)
  } catch (err) {
    console.error('Erro em POST /projects:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.put('/projects/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const { id } = req.params
  const { name, client_id, address, start_date, status } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (address !== undefined) updates.address = address?.trim() || null
  if (start_date !== undefined) updates.start_date = start_date || null
  if (status !== undefined) {
    if (!['active', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use "active" ou "completed".' })
    }
    updates.status = status
  }

  if (Object.keys(updates).length === 0 && client_id === undefined) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  try {
    // Cliente vinculado: valida e denormaliza o nome em `client`.
    if (client_id !== undefined) {
      if (!client_id) {
        return res.status(400).json({ error: 'Selecione um cliente para o projeto.' })
      }
      const { rows: cli } = await query('SELECT name FROM clients WHERE id = $1', [client_id])
      if (!cli[0]) {
        return res.status(400).json({ error: 'Cliente não encontrado.' })
      }
      updates.client_id = client_id
      updates.client = cli[0].name
    }

    const setClauses = []
    const values = []
    let paramCount = 1

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    values.push(id)
    const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING id, name, client, client_id, address, start_date, status, image_url, created_at, updated_at`

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

router.post('/projects/:id/image', requireAuth, requireProjectManagement, upload.single('image'), async (req, res) => {
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
