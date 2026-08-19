import { Router } from 'express'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteSuppliers, canManageSuppliers, canViewSuppliers, isAdmin } from '../lib/permissions.js'
import { logger } from '../lib/logger.js'
import { normalizarContatos } from '../lib/personContacts.js'
import {
  aplicarVisibilidade, aplicarVisibilidadeEmLista, filtrarLinhasRestritas,
  CAMPOS_RESTRINGIVEIS, PADRAO_RESTRITO,
} from '../lib/personVisibility.js'

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

  // is_restricted vai junto do INSERT — ver o comentário equivalente em
  // clients.js. Quem decide o valor final é resolverRestricaoLinhas +
  // preservarLinhasInvisiveis, chamadas ANTES de gravarFilhas.
  for (const p of phones) {
    await client.query(
      `INSERT INTO person_phones (supplier_id, label, value, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [supplierId, p.label, p.value, p.is_primary, p.position, p.is_restricted])
  }
  for (const e of emails) {
    await client.query(
      `INSERT INTO person_emails (supplier_id, label, value, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [supplierId, e.label, e.value, e.is_primary, e.position, e.is_restricted])
  }
  for (const a of addresses) {
    await client.query(
      `INSERT INTO person_addresses
         (supplier_id, label, cep, street, number, complement, district, city, uf, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [supplierId, a.label, a.cep, a.street, a.number, a.complement, a.district, a.city, a.uf, a.is_primary, a.position, a.is_restricted])
  }
  for (const l of links) {
    await client.query(
      `INSERT INTO person_links (company_supplier_id, member_supplier_id, role) VALUES ($1,$2,$3)`,
      [supplierId, l.member_supplier_id, l.role])
  }
}

// Ver o comentário equivalente em clients.js — mesma regra, mesma correção.
function resolverRestricaoLinhas(itens, existentesPorId, isAdminUser) {
  return itens.map((item) => {
    const existente = item.id ? existentesPorId[item.id] : undefined
    let is_restricted
    if (isAdminUser && item.is_restricted !== undefined) {
      is_restricted = Boolean(item.is_restricted)
    } else if (existente) {
      is_restricted = existente.is_restricted
    } else {
      is_restricted = false
    }
    return { ...item, is_restricted }
  })
}

async function carregarLinhasAtuais(supplierId) {
  if (!supplierId) return { phones: [], emails: [], addresses: [] }
  const [{ rows: phones }, { rows: emails }, { rows: addresses }] = await Promise.all([
    query('SELECT * FROM person_phones WHERE supplier_id = $1', [supplierId]),
    query('SELECT * FROM person_emails WHERE supplier_id = $1', [supplierId]),
    query('SELECT * FROM person_addresses WHERE supplier_id = $1', [supplierId]),
  ])
  return { phones, emails, addresses }
}

const porId = (linhas) => Object.fromEntries(linhas.map((l) => [l.id, l]))

// Ver o comentário equivalente em clients.js — mesma regra, mesma correção.
function preservarLinhasInvisiveis(itensSubmetidos, linhasAtuais, isAdminUser) {
  if (isAdminUser) return itensSubmetidos

  const idsSubmetidos = new Set(itensSubmetidos.filter((i) => i.id).map((i) => i.id))
  const perdidas = linhasAtuais.filter((l) => l.is_restricted && !idsSubmetidos.has(l.id))
  if (perdidas.length === 0) return itensSubmetidos

  const restauraPrincipal = perdidas.some((l) => l.is_primary)
  const base = restauraPrincipal
    ? itensSubmetidos.map((i) => ({ ...i, is_primary: false }))
    : itensSubmetidos

  return [...base, ...perdidas]
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
                      pa.street AS primary_address,
                      rf.campos AS campos
               FROM suppliers s
               LEFT JOIN LATERAL (
                 -- Achado do reinventário de 19/08/2026: sem o filtro de
                 -- is_restricted aqui, a linha principal marcada como restrita
                 -- vazava no resumo da listagem mesmo escondida na ficha — ver
                 -- o comentário equivalente em clients.js.
                 SELECT value FROM person_phones
                 WHERE supplier_id = s.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pp ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_emails
                 WHERE supplier_id = s.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pe ON true
               LEFT JOIN LATERAL (
                 SELECT street FROM person_addresses
                 WHERE supplier_id = s.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pa ON true
               LEFT JOIN LATERAL (
                 -- Agrega os campos restritos num array só, sem N+1.
                 SELECT array_agg(field_name) AS campos
                 FROM person_restricted_fields WHERE supplier_id = s.id
               ) rf ON true`
    const conditions = []
    // $1 é o isAdmin — usado pelas LATERAL de contato principal acima.
    const params = [isAdmin(req.profile)]

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
    const restritosPorId = {}
    for (const r of rows) restritosPorId[r.id] = r.campos || []
    // `campos` é dado interno — não vai para a resposta.
    for (const r of rows) delete r.campos
    return res.json(aplicarVisibilidadeEmLista(req.profile, rows, restritosPorId))
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

    const [{ rows: phones }, { rows: emails }, { rows: addresses }, { rows: links }, { rows: restritosRows }] = await Promise.all([
      // is_restricted precisa vir junto: filtrarLinhasRestritas() decide por ela.
      query(`SELECT id, label, value, is_primary, position, is_restricted FROM person_phones
              WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, value, is_primary, position, is_restricted FROM person_emails
              WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, cep, street, number, complement, district, city, uf, is_primary, position, is_restricted
               FROM person_addresses WHERE supplier_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT l.id, l.role, l.member_supplier_id, m.name AS member_name, m.person_type AS member_person_type
               FROM person_links l
               JOIN suppliers m ON m.id = l.member_supplier_id
              WHERE l.company_supplier_id = $1 ORDER BY l.role, m.name`, [req.params.id]),
      query(`SELECT field_name FROM person_restricted_fields WHERE supplier_id = $1`, [req.params.id]),
    ])
    const restritos = restritosRows.map((r) => r.field_name)

    return res.json({
      ...aplicarVisibilidade(req.profile, fornecedor, restritos),
      // Só admin recebe a marcação — é quem pode alterá-la (mesma lógica do
      // resto: quem não pode mudar não precisa saber que existe). Sem isto o
      // PUT seguinte reverte a marcação em silêncio: o front não tinha como
      // saber o que estava restrito e mandava o palpite padrão.
      ...(isAdmin(req.profile) ? { restricted_fields: restritos } : {}),
      phones: filtrarLinhasRestritas(req.profile, phones),
      emails: filtrarLinhasRestritas(req.profile, emails),
      addresses: filtrarLinhasRestritas(req.profile, addresses),
      links,
    })
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
  // Criação: sem linha anterior para casar por id — ver o comentário
  // equivalente em clients.js.
  parsed.phones = resolverRestricaoLinhas(parsed.phones, {}, isAdmin(req.profile))
  parsed.emails = resolverRestricaoLinhas(parsed.emails, {}, isAdmin(req.profile))
  parsed.addresses = resolverRestricaoLinhas(parsed.addresses, {}, isAdmin(req.profile))

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
      // "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários."
      for (const campo of PADRAO_RESTRITO) {
        await client.query(
          `INSERT INTO person_restricted_fields (supplier_id, field_name) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [novo.id, campo])
      }
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

  // Só admin muda o que é restrito. Um colaborador que pudesse desmarcar
  // esvaziaria a proteção inteira com um PUT.
  if (req.body.restricted_fields !== undefined && !isAdmin(req.profile)) {
    return res.status(403).json({ error: 'Só o administrador altera a visibilidade dos campos.' })
  }

  try {
    // SELECT * (não só admin_only): task 5 precisa dos valores atuais de TODOS
    // os campos restringíveis, para preservá-los quando quem edita não os viu.
    const { rows: existingRows } = await query(
      `SELECT * FROM suppliers WHERE id = $1`,
      [req.params.id],
    )
    const existing = existingRows[0]
    // Não-admin não enxerga (nem edita) fornecedores restritos.
    if (!existing || (existing.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    }
    // Só admin altera o flag; os demais preservam o valor atual.
    const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : existing.admin_only

    // Campo restringível que o corpo nem tocou preserva o valor atual — ver o
    // comentário equivalente em clients.js.
    for (const campo of CAMPOS_RESTRINGIVEIS) {
      if (req.body[campo] === undefined) parsed.data[campo] = existing[campo]
    }

    // Quem não podia VER o campo não pode APAGÁ-LO sem querer. Ver o comentário
    // equivalente em clients.js — mesmo bug, mesma correção.
    if (!isAdmin(req.profile)) {
      const { rows: restritosRows } = await query(
        `SELECT field_name FROM person_restricted_fields WHERE supplier_id = $1`, [req.params.id])
      for (const { field_name: campo } of restritosRows) {
        if (CAMPOS_RESTRINGIVEIS.has(campo)) parsed.data[campo] = existing[campo]
      }
    }

    // Mesmo raciocínio, um nível abaixo — ver o comentário equivalente em
    // clients.js.
    const atuais = await carregarLinhasAtuais(req.params.id)
    const admin = isAdmin(req.profile)
    parsed.phones = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.phones, porId(atuais.phones), admin), atuais.phones, admin)
    parsed.emails = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.emails, porId(atuais.emails), admin), atuais.emails, admin)
    parsed.addresses = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.addresses, porId(atuais.addresses), admin), atuais.addresses, admin)

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

      // Regrava a marcação de restrição só quando ela veio no corpo — e só
      // com os nomes que estão na allowlist.
      if (req.body.restricted_fields !== undefined) {
        const campos = (req.body.restricted_fields || []).filter((c) => CAMPOS_RESTRINGIVEIS.has(c))
        await client.query('DELETE FROM person_restricted_fields WHERE supplier_id = $1', [req.params.id])
        for (const campo of campos) {
          await client.query(
            `INSERT INTO person_restricted_fields (supplier_id, field_name) VALUES ($1,$2)`,
            [req.params.id, campo])
        }
      }

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
