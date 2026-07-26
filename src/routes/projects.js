import { Router } from 'express'
import multer from 'multer'
import { query, withTransaction } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'
import { logger } from '../lib/logger.js'

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

// Documentos do projeto: aceita qualquer tipo de arquivo (pdf, docx, imagens…).
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})

const router = Router()

router.get('/projects', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.briefing,
              c.phone AS client_phone, c.email AS client_email, c.address AS client_address,
              p.created_at, p.updated_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/deleted')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects')
    return res.status(400).json({ error: err.message })
  }
})

router.put('/projects/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const { id } = req.params
  const { name, client_id, address, start_date, status, briefing } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (address !== undefined) updates.address = address?.trim() || null
  if (start_date !== undefined) updates.start_date = start_date || null
  if (briefing !== undefined) updates.briefing = briefing || null
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
    const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING id, name, client, client_id, address, start_date, status, image_url, briefing, created_at, updated_at`

    const { rows } = await query(sql, values)

    if (!rows[0]) {
      return res.status(404).json({ error: 'Projeto não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /projects/:id')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects/:id/restore')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /projects/:id')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects/:id/image')
    return res.status(400).json({ error: err.message })
  }
})

// ─── DOCUMENTOS DO PROJETO ──────────────────────────────────────────
// Projetos são visíveis a qualquer usuário autenticado; anexos seguem a
// mesma regra (listar/anexar liberado; excluir só quem enviou ou admin).
router.get('/projects/:id/documents', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.id, d.file_url, d.file_name, d.file_size, d.mime_type, d.created_at,
              d.uploaded_by, u.name AS uploaded_by_name
       FROM project_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.project_id = $1
       ORDER BY d.created_at DESC`,
      [req.params.id],
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id/documents')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects/:id/documents', requireAuth, uploadDoc.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const { rows: proj } = await query(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    )
    if (!proj[0]) return res.status(404).json({ error: 'Projeto não encontrado.' })

    const { url } = await uploadFile('projects', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    const { rows } = await query(
      `INSERT INTO project_documents (project_id, uploaded_by, file_url, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_url, file_name, file_size, mime_type, created_at, uploaded_by`,
      [req.params.id, req.profile.id, url, req.file.originalname, req.file.size, req.file.mimetype],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects/:id/documents')
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/projects/:id/documents/:docId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, file_url, uploaded_by FROM project_documents WHERE id = $1 AND project_id = $2',
      [req.params.docId, req.params.id],
    )
    const doc = rows[0]
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' })
    if (doc.uploaded_by !== req.profile.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para excluir o documento.' })
    }

    const key = extractKeyFromUrl(doc.file_url)
    if (key) await deleteFile(key)
    await query('DELETE FROM project_documents WHERE id = $1', [req.params.docId])
    return res.status(204).send()
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /projects/:id/documents/:docId')
    return res.status(400).json({ error: err.message })
  }
})

// Horas do usuário logado neste projeto (hoje / mês corrente), apontamentos concluídos.
router.get('/projects/:id/my-hours', requireAuth, async (req, res) => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const todayStr = now.toISOString().slice(0, 10)
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(duration_minutes), 0)::int AS month_minutes,
         COALESCE(SUM(duration_minutes) FILTER (
           WHERE started_at >= ($3::date AT TIME ZONE 'America/Sao_Paulo')
         ), 0)::int AS today_minutes
       FROM time_entries
       WHERE user_id = $1 AND project_id = $2 AND status = 'completed'
         AND started_at >= ($4::date AT TIME ZONE 'America/Sao_Paulo')`,
      [req.profile.id, req.params.id, todayStr, monthStart],
    )
    return res.json(rows[0] || { month_minutes: 0, today_minutes: 0 })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id/my-hours')
    return res.status(400).json({ error: err.message })
  }
})

export default router
