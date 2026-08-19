import { Router } from 'express'
import multer from 'multer'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteClients, canManageClients, canViewClients, isAdmin } from '../lib/permissions.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { logger } from '../lib/logger.js'
import { normalizarContatos } from '../lib/personContacts.js'

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

const PAPEIS_VINCULO = new Set(['socio', 'responsavel_tecnico', 'contato_principal', 'financeiro'])

function parseClientPayload(body = {}) {
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
    if (!l?.member_client_id) return { error: 'Todo vínculo precisa apontar para uma pessoa cadastrada.' }
    if (!PAPEIS_VINCULO.has(l.role)) return { error: `Papel de vínculo inválido: ${l.role}.` }
    links.push({ member_client_id: l.member_client_id, role: l.role })
  }

  return {
    data: {
      name,
      person_type: personType,
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
async function gravarFilhas(client, clientId, { phones, emails, addresses, links }) {
  await client.query('DELETE FROM person_phones    WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_emails    WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_addresses WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_links     WHERE company_client_id = $1', [clientId])

  for (const p of phones) {
    await client.query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [clientId, p.label, p.value, p.is_primary, p.position])
  }
  for (const e of emails) {
    await client.query(
      `INSERT INTO person_emails (client_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [clientId, e.label, e.value, e.is_primary, e.position])
  }
  for (const a of addresses) {
    await client.query(
      `INSERT INTO person_addresses
         (client_id, label, cep, street, number, complement, district, city, uf, is_primary, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [clientId, a.label, a.cep, a.street, a.number, a.complement, a.district, a.city, a.uf, a.is_primary, a.position])
  }
  for (const l of links) {
    await client.query(
      `INSERT INTO person_links (company_client_id, member_client_id, role) VALUES ($1,$2,$3)`,
      [clientId, l.member_client_id, l.role])
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
    let sql = `SELECT c.id, c.name, c.person_type, c.notes, c.cpf, c.rg, c.birth_date,
                      c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual, c.founded_date,
                      c.admin_only, c.created_at, c.updated_at,
                      COALESCE(ac.attachment_count, 0)::int AS attachment_count,
                      pp.value AS primary_phone,
                      pe.value AS primary_email,
                      pa.street AS primary_address
               FROM clients c
               LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS attachment_count
                 FROM client_attachments a WHERE a.client_id = c.id
               ) ac ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_phones WHERE client_id = c.id AND is_primary LIMIT 1
               ) pp ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_emails WHERE client_id = c.id AND is_primary LIMIT 1
               ) pe ON true
               LEFT JOIN LATERAL (
                 SELECT street FROM person_addresses WHERE client_id = c.id AND is_primary LIMIT 1
               ) pa ON true`
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

// Ficha completa. A listagem traz só os principais (é listagem); aqui vêm as
// listas inteiras, que é o que o formulário de edição precisa.
router.get('/admin/clients/:id', requireAuth, requireCanViewClients, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM clients WHERE id = $1`, [req.params.id])
    const cliente = rows[0]
    // Restrito só aparece para admin — mesmo 404 do resto da rota, para não
    // revelar a existência do cadastro pela diferença entre 403 e 404.
    if (!cliente || (cliente.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    const [{ rows: phones }, { rows: emails }, { rows: addresses }, { rows: links }] = await Promise.all([
      query(`SELECT id, label, value, is_primary, position FROM person_phones
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, value, is_primary, position FROM person_emails
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, cep, street, number, complement, district, city, uf, is_primary, position
               FROM person_addresses WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT l.id, l.role, l.member_client_id, m.name AS member_name, m.person_type AS member_person_type
               FROM person_links l
               JOIN clients m ON m.id = l.member_client_id
              WHERE l.company_client_id = $1 ORDER BY l.role, m.name`, [req.params.id]),
    ])

    return res.json({ ...cliente, phones, emails, addresses, links })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/clients/:id')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/clients', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  // Só admin pode marcar como restrito.
  const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : false

  try {
    const cliente = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO clients (name, person_type, notes, cpf, rg, birth_date,
                              razao_social, nome_fantasia, cnpj, inscricao_estadual, founded_date,
                              bank_name, bank_agency, bank_account, bank_account_type, pix_key, admin_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [parsed.data.name, parsed.data.person_type, parsed.data.notes, parsed.data.cpf, parsed.data.rg,
         parsed.data.birth_date, parsed.data.razao_social, parsed.data.nome_fantasia, parsed.data.cnpj,
         parsed.data.inscricao_estadual, parsed.data.founded_date, parsed.data.bank_name,
         parsed.data.bank_agency, parsed.data.bank_account, parsed.data.bank_account_type,
         parsed.data.pix_key, adminOnly],
      )
      const novo = rows[0]
      await gravarFilhas(client, novo.id, parsed)
      return novo
    })
    return res.status(201).json(cliente)
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

    const cliente = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE clients SET name = $1, person_type = $2, notes = $3, cpf = $4, rg = $5, birth_date = $6,
                            razao_social = $7, nome_fantasia = $8, cnpj = $9, inscricao_estadual = $10,
                            founded_date = $11, bank_name = $12, bank_agency = $13, bank_account = $14,
                            bank_account_type = $15, pix_key = $16, admin_only = $17
         WHERE id = $18 RETURNING *`,
        [parsed.data.name, parsed.data.person_type, parsed.data.notes, parsed.data.cpf, parsed.data.rg,
         parsed.data.birth_date, parsed.data.razao_social, parsed.data.nome_fantasia, parsed.data.cnpj,
         parsed.data.inscricao_estadual, parsed.data.founded_date, parsed.data.bank_name,
         parsed.data.bank_agency, parsed.data.bank_account, parsed.data.bank_account_type,
         parsed.data.pix_key, adminOnly, req.params.id],
      )
      const atualizado = rows[0]
      if (!atualizado) return null
      await gravarFilhas(client, atualizado.id, parsed)
      return atualizado
    })

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    return res.json(cliente)
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
