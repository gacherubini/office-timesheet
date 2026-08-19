import { Router } from 'express'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteSuppliers, canManageSuppliers, canViewSuppliers, isAdmin } from '../lib/permissions.js'
import { logger } from '../lib/logger.js'
import { normalizarContatos } from '../lib/personContacts.js'

const router = Router()

function optionalText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

const PAPEIS_VINCULO = new Set(['socio', 'responsavel_tecnico', 'contato_principal', 'financeiro'])

function parseSupplierPayload(body = {}) {
  const personType = body.person_type === 'pj' ? 'pj' : 'pf'

  // Para PJ o nome de exibição é derivado; para PF é digitado. `name` continua
  // sendo a coluna que projetos, agente e telas leem — ver o comentário da 040.
  let name
  if (personType === 'pj') {
    const razao = optionalText(body.razao_social)
    if (!razao) return { error: 'Razão social é obrigatória para pessoa jurídica.' }
    name = optionalText(body.nome_fantasia) || razao
  } else {
    name = optionalText(body.name)
    if (!name) return { error: 'Nome é obrigatório.' }
  }

  const phones = normalizarContatos(body.phones, { tipo: 'phone' })
  if (phones.error) return { error: phones.error }
  const emails = normalizarContatos(body.emails, { tipo: 'email' })
  if (emails.error) return { error: emails.error }
  const addresses = normalizarContatos(body.addresses, { tipo: 'address' })
  if (addresses.error) return { error: addresses.error }

  const links = []
  for (const l of Array.isArray(body.links) ? body.links : []) {
    if (!l?.member_supplier_id) return { error: 'Todo vínculo precisa apontar para uma pessoa cadastrada.' }
    if (!PAPEIS_VINCULO.has(l.role)) return { error: `Papel de vínculo inválido: ${l.role}.` }
    links.push({ member_supplier_id: l.member_supplier_id, role: l.role })
  }

  return {
    data: {
      name,
      person_type: personType,
      category: optionalText(body.category),
      notes: optionalText(body.notes),
      cpf: optionalText(body.cpf),
      rg: optionalText(body.rg),
      birth_date: optionalText(body.birth_date),
      razao_social: optionalText(body.razao_social),
      nome_fantasia: optionalText(body.nome_fantasia),
      cnpj: optionalText(body.cnpj),
      inscricao_estadual: optionalText(body.inscricao_estadual),
      founded_date: optionalText(body.founded_date),
      bank_name: optionalText(body.bank_name),
      bank_agency: optionalText(body.bank_agency),
      bank_account: optionalText(body.bank_account),
      bank_account_type: optionalText(body.bank_account_type),
      pix_key: optionalText(body.pix_key),
    },
    phones: phones.itens,
    emails: emails.itens,
    addresses: addresses.itens,
    links,
  }
}

// Substituição total dentro de UMA transação: é como um formulário salva.
// Diff por id multiplicaria endpoints e estados de erro para um cadastro que
// uma pessoa edita de cada vez.
async function gravarFilhas(client, supplierId, { phones, emails, addresses, links }) {
  await client.query('DELETE FROM person_phones    WHERE supplier_id = $1', [supplierId])
  await client.query('DELETE FROM person_emails    WHERE supplier_id = $1', [supplierId])
  await client.query('DELETE FROM person_addresses WHERE supplier_id = $1', [supplierId])
  await client.query('DELETE FROM person_links     WHERE company_supplier_id = $1', [supplierId])

  for (const p of phones) {
    await client.query(
      `INSERT INTO person_phones (supplier_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [supplierId, p.label, p.value, p.is_primary, p.position])
  }
  for (const e of emails) {
    await client.query(
      `INSERT INTO person_emails (supplier_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [supplierId, e.label, e.value, e.is_primary, e.position])
  }
  for (const a of addresses) {
    await client.query(
      `INSERT INTO person_addresses
         (supplier_id, label, cep, street, number, complement, district, city, uf, is_primary, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [supplierId, a.label, a.cep, a.street, a.number, a.complement, a.district, a.city, a.uf, a.is_primary, a.position])
  }
  for (const l of links) {
    await client.query(
      `INSERT INTO person_links (company_supplier_id, member_supplier_id, role) VALUES ($1,$2,$3)`,
      [supplierId, l.member_supplier_id, l.role])
  }
}

function requireCanManageSuppliers(req, res, next) {
  if (!canManageSuppliers(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a fornecedores.' })
  }

  return next()
}

// Ler a lista é liberado a qualquer autenticado; o WHERE admin_only esconde os
// restritos dos não-admins. Gerir segue em requireCanManageSuppliers.
function requireCanViewSuppliers(req, res, next) {
  if (!canViewSuppliers(req.profile)) {
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

router.get('/admin/suppliers', requireAuth, requireCanViewSuppliers, async (req, res) => {
  const q = req.query.q?.trim()

  try {
    let sql = `SELECT s.id, s.name, s.person_type, s.category, s.notes, s.cpf, s.rg, s.birth_date,
                      s.razao_social, s.nome_fantasia, s.cnpj, s.inscricao_estadual, s.founded_date,
                      s.admin_only, s.created_at, s.updated_at,
                      pp.value AS primary_phone,
                      pe.value AS primary_email,
                      pa.street AS primary_address
               FROM suppliers s
               LEFT JOIN LATERAL (
                 SELECT value FROM person_phones WHERE supplier_id = s.id AND is_primary LIMIT 1
               ) pp ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_emails WHERE supplier_id = s.id AND is_primary LIMIT 1
               ) pe ON true
               LEFT JOIN LATERAL (
                 SELECT street FROM person_addresses WHERE supplier_id = s.id AND is_primary LIMIT 1
               ) pa ON true`
    const conditions = []
    const params = []

    // Fornecedores restritos só aparecem para admins.
    if (!isAdmin(req.profile)) {
      conditions.push(`s.admin_only = false`)
    }
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`s.name ILIKE $${params.length}`)
    }
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ` ORDER BY s.name ASC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/suppliers')
    return res.status(400).json({ error: err.message })
  }
})

// Ficha completa. A listagem traz só os principais (é listagem); aqui vêm as
// listas inteiras, que é o que o formulário de edição precisa.
router.get('/admin/suppliers/:id', requireAuth, requireCanViewSuppliers, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM suppliers WHERE id = $1`, [req.params.id])
    const fornecedor = rows[0]
    // Restrito só aparece para admin — mesmo 404 do resto da rota, para não
    // revelar a existência do cadastro pela diferença entre 403 e 404.
    if (!fornecedor || (fornecedor.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }

    const [{ rows: phones }, { rows: emails }, { rows: addresses }, { rows: links }] = await Promise.all([
      query(`SELECT id, label, value, is_primary, position FROM person_phones
              WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, value, is_primary, position FROM person_emails
              WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, cep, street, number, complement, district, city, uf, is_primary, position
               FROM person_addresses WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT l.id, l.role, l.member_supplier_id, m.name AS member_name, m.person_type AS member_person_type
               FROM person_links l
               JOIN suppliers m ON m.id = l.member_supplier_id
              WHERE l.company_supplier_id = $1 ORDER BY l.role, m.name`, [req.params.id]),
    ])

    return res.json({ ...fornecedor, phones, emails, addresses, links })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/suppliers/:id')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/suppliers', requireAuth, requireCanManageSuppliers, async (req, res) => {
  const parsed = parseSupplierPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  // Só admin pode marcar como restrito.
  const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : false

  try {
    const fornecedor = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO suppliers (name, person_type, category, notes, cpf, rg, birth_date,
                                razao_social, nome_fantasia, cnpj, inscricao_estadual, founded_date,
                                bank_name, bank_agency, bank_account, bank_account_type, pix_key, admin_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [parsed.data.name, parsed.data.person_type, parsed.data.category, parsed.data.notes, parsed.data.cpf,
         parsed.data.rg, parsed.data.birth_date, parsed.data.razao_social, parsed.data.nome_fantasia,
         parsed.data.cnpj, parsed.data.inscricao_estadual, parsed.data.founded_date, parsed.data.bank_name,
         parsed.data.bank_agency, parsed.data.bank_account, parsed.data.bank_account_type,
         parsed.data.pix_key, adminOnly],
      )
      const novo = rows[0]
      await gravarFilhas(client, novo.id, parsed)
      return novo
    })
    return res.status(201).json(fornecedor)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /admin/suppliers')
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

    const fornecedor = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE suppliers SET name = $1, person_type = $2, category = $3, notes = $4, cpf = $5, rg = $6,
                              birth_date = $7, razao_social = $8, nome_fantasia = $9, cnpj = $10,
                              inscricao_estadual = $11, founded_date = $12, bank_name = $13, bank_agency = $14,
                              bank_account = $15, bank_account_type = $16, pix_key = $17, admin_only = $18
         WHERE id = $19 RETURNING *`,
        [parsed.data.name, parsed.data.person_type, parsed.data.category, parsed.data.notes, parsed.data.cpf,
         parsed.data.rg, parsed.data.birth_date, parsed.data.razao_social, parsed.data.nome_fantasia,
         parsed.data.cnpj, parsed.data.inscricao_estadual, parsed.data.founded_date, parsed.data.bank_name,
         parsed.data.bank_agency, parsed.data.bank_account, parsed.data.bank_account_type,
         parsed.data.pix_key, adminOnly, req.params.id],
      )
      const atualizado = rows[0]
      if (!atualizado) return null
      await gravarFilhas(client, atualizado.id, parsed)
      return atualizado
    })

    if (!fornecedor) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }

    return res.json(fornecedor)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /admin/suppliers/:id')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /admin/suppliers/:id')
    return res.status(400).json({ error: err.message })
  }
})

export default router
