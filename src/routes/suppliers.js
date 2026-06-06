import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteSuppliers, canManageSuppliers, isAdmin } from '../lib/permissions.js'

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

  try {
    let sql = `SELECT id, name, category, email, phone, notes, admin_only, created_at, updated_at FROM suppliers`
    const conditions = []
    const params = []

    // Fornecedores restritos só aparecem para admins.
    if (!isAdmin(req.profile)) {
      conditions.push(`admin_only = false`)
    }
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`name ILIKE $${params.length}`)
    }
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ` ORDER BY name ASC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    console.error('Erro em GET /admin/suppliers:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/suppliers', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const parsed = parseSupplierPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  // Só admin pode marcar como restrito.
  const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : false

  try {
    const { rows } = await query(
      `INSERT INTO suppliers (name, category, email, phone, notes, admin_only) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [parsed.data.name, parsed.data.category, parsed.data.email, parsed.data.phone, parsed.data.notes, adminOnly],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    console.error('Erro em POST /admin/suppliers:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.put('/admin/suppliers/:id', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const parsed = parseSupplierPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    const { rows: existingRows } = await query(
      `SELECT admin_only FROM suppliers WHERE id = $1`,
      [req.params.id],
    )
    const existing = existingRows[0]
    // Não-admin não enxerga (nem edita) fornecedores restritos.
    if (!existing || (existing.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }
    // Só admin altera o flag; os demais preservam o valor atual.
    const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : existing.admin_only

    const { rows } = await query(
      `UPDATE suppliers SET name = $1, category = $2, email = $3, phone = $4, notes = $5, admin_only = $6 WHERE id = $7 RETURNING *`,
      [parsed.data.name, parsed.data.category, parsed.data.email, parsed.data.phone, parsed.data.notes, adminOnly, req.params.id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em PUT /admin/suppliers/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/admin/suppliers/:id', requireAuth, requireCanDeleteSuppliers, async (req, res) => {
  try {
    // Fornecedor restrito só pode ser excluído por admin (ninguém mais o vê).
    const { rows } = await query(
      `DELETE FROM suppliers WHERE id = $1 AND (admin_only = false OR $2 = true) RETURNING id`,
      [req.params.id, isAdmin(req.profile)],
    )
    if (!rows[0]) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }
    return res.json({ message: 'Fornecedor excluído com sucesso.' })
  } catch (err) {
    console.error('Erro em DELETE /admin/suppliers/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

export default router
