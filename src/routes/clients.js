import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteClients, canManageClients } from '../lib/permissions.js'

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

function requireCanManageClients(req, res, next) {
  if (!canManageClients(req.profile)) {
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

router.get('/admin/clients', requireAuth, requireCanManageClients, async (req, res) => {
  const q = req.query.q?.trim()

  try {
    let sql = `SELECT id, name, email, phone, notes, created_at, updated_at FROM clients`
    const params = []

    if (q) {
      sql += ` WHERE name ILIKE $1`
      params.push(`%${q}%`)
    }

    sql += ` ORDER BY name ASC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    console.error('Erro em GET /admin/clients:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/clients', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows } = await query(
      `INSERT INTO clients (name, email, phone, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [parsed.data.name, parsed.data.email, parsed.data.phone, parsed.data.notes],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    console.error('Erro em POST /admin/clients:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.put('/admin/clients/:id', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows } = await query(
      `UPDATE clients SET name = $1, email = $2, phone = $3, notes = $4 WHERE id = $5 RETURNING *`,
      [parsed.data.name, parsed.data.email, parsed.data.phone, parsed.data.notes, req.params.id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em PUT /admin/clients/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/admin/clients/:id', requireAuth, requireCanDeleteClients, async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM clients WHERE id = $1 RETURNING id`,
      [req.params.id],
    )
    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }
    return res.json({ message: 'Cliente excluído com sucesso.' })
  } catch (err) {
    console.error('Erro em DELETE /admin/clients/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

export default router
