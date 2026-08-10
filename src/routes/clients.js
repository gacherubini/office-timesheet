import { Router } from 'express'
import multer from 'multer'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteClients, canManageClients, canViewClients, isAdmin } from '../lib/permissions.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { logger } from '../lib/logger.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

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
      cpf: optionalText(body.cpf),
      birth_date: optionalText(body.birth_date),
      address: optionalText(body.address),
    },
  }
}

function requireCanManageClients(req, res, next) {
  if (!canManageClients(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a clientes.' })
  }

  return next()
}

// Ler a lista é liberado a qualquer autenticado; o WHERE admin_only esconde os
// restritos dos não-admins. Gerir segue em requireCanManageClients.
function requireCanViewClients(req, res, next) {
  if (!canViewClients(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a clientes.' })
  }

  return next()
}

function requireCanDeleteClients(req, res, next) {
  if (!canDeleteClients(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito à exclusão de clientes.' })
  }

  return next()
}

router.get('/admin/clients', requireAuth, requireCanViewClients, async (req, res) => {
  const q = req.query.q?.trim()

  try {
    let sql = `SELECT c.id, c.name, c.email, c.phone, c.notes, c.cpf, c.birth_date, c.address,
                      c.admin_only, c.created_at, c.updated_at,
                      COALESCE(ac.attachment_count, 0)::int AS attachment_count
               FROM clients c
               LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS attachment_count
                 FROM client_attachments a WHERE a.client_id = c.id
               ) ac ON true`
    const conditions = []
    const params = []

    // Clientes restritos só aparecem para admins.
    if (!isAdmin(req.profile)) {
      conditions.push(`c.admin_only = false`)
    }
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`c.name ILIKE $${params.length}`)
    }
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ` ORDER BY c.name ASC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/clients')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/clients', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  // Só admin pode marcar como restrito.
  const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : false

  try {
    const { rows } = await query(
      `INSERT INTO clients (name, email, phone, notes, cpf, birth_date, address, admin_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [parsed.data.name, parsed.data.email, parsed.data.phone, parsed.data.notes,
       parsed.data.cpf, parsed.data.birth_date, parsed.data.address, adminOnly],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /admin/clients')
    return res.status(400).json({ error: err.message })
  }
})

router.put('/admin/clients/:id', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows: existingRows } = await query(
      `SELECT admin_only FROM clients WHERE id = $1`,
      [req.params.id],
    )
    const existing = existingRows[0]
    // Não-admin não enxerga (nem edita) clientes restritos.
    if (!existing || (existing.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }
    // Só admin altera o flag; os demais preservam o valor atual.
    const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : existing.admin_only

    const { rows } = await query(
      `UPDATE clients SET name = $1, email = $2, phone = $3, notes = $4,
                          cpf = $5, birth_date = $6, address = $7, admin_only = $8
       WHERE id = $9 RETURNING *`,
      [parsed.data.name, parsed.data.email, parsed.data.phone, parsed.data.notes,
       parsed.data.cpf, parsed.data.birth_date, parsed.data.address, adminOnly, req.params.id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /admin/clients/:id')
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/admin/clients/:id', requireAuth, requireCanDeleteClients, async (req, res) => {
  try {
    // Cliente restrito só pode ser excluído por admin (ninguém mais o vê).
    const { rows } = await query(
      `DELETE FROM clients WHERE id = $1 AND (admin_only = false OR $2 = true) RETURNING id`,
      [req.params.id, isAdmin(req.profile)],
    )
    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }
    return res.json({ message: 'Cliente excluído com sucesso.' })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /admin/clients/:id')
    return res.status(400).json({ error: err.message })
  }
})

// ─── ANEXOS DO CLIENTE ─────────────────────────────────────────────────
// Garante que o cliente existe e é visível para o usuário (restritos só admin).
async function loadVisibleClient(req) {
  const { rows } = await query('SELECT id, admin_only FROM clients WHERE id = $1', [req.params.id])
  const client = rows[0]
  if (!client || (client.admin_only && !isAdmin(req.profile))) return null
  return client
}

router.get('/admin/clients/:id/attachments', requireAuth, requireCanManageClients, async (req, res) => {
  try {
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    const { rows } = await query(
      `SELECT a.id, a.file_url, a.file_name, a.file_size, a.mime_type, a.created_at,
              a.uploaded_by, u.name AS uploaded_by_name
       FROM client_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.client_id = $1
       ORDER BY a.created_at DESC`,
      [req.params.id],
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/clients/:id/attachments')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/clients/:id/attachments', requireAuth, requireCanManageClients, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    const { url } = await uploadFile('clients', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    const { rows } = await query(
      `INSERT INTO client_attachments (client_id, uploaded_by, file_url, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_url, file_name, file_size, mime_type, created_at, uploaded_by`,
      [req.params.id, req.profile.id, url, req.file.originalname, req.file.size, req.file.mimetype],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /admin/clients/:id/attachments')
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/admin/clients/:id/attachments/:attId', requireAuth, requireCanManageClients, async (req, res) => {
  try {
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    const { rows } = await query(
      'SELECT id, file_url, uploaded_by FROM client_attachments WHERE id = $1 AND client_id = $2',
      [req.params.attId, req.params.id],
    )
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Anexo não encontrado.' })
    if (att.uploaded_by !== req.profile.id && !isAdmin(req.profile)) {
      return res.status(403).json({ error: 'Sem permissão para excluir o anexo.' })
    }

    const key = extractKeyFromUrl(att.file_url)
    if (key) await deleteFile(key)
    await query('DELETE FROM client_attachments WHERE id = $1', [req.params.attId])
    return res.status(204).send()
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /admin/clients/:id/attachments/:attId')
    return res.status(400).json({ error: err.message })
  }
})

export default router
