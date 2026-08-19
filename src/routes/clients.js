import { Router } from 'express'
import multer from 'multer'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { canDeleteClients, canManageClients, canViewClients, isAdmin } from '../lib/permissions.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { logger } from '../lib/logger.js'
import { normalizarContatos } from '../lib/personContacts.js'
import {
  aplicarVisibilidade, aplicarVisibilidadeEmLista, filtrarLinhasRestritas,
  CAMPOS_RESTRINGIVEIS, PADRAO_RESTRITO,
} from '../lib/personVisibility.js'

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

  // is_restricted vai junto do INSERT: sem isto, toda linha reinserida volta
  // com o default `false` e a marcação de restrito desaparece no primeiro
  // salvamento seguinte, mesmo que ninguém tenha mexido nela. Quem decide o
  // valor final (preservar do banco ou aceitar o do corpo) é resolverRestricaoLinhas,
  // chamada ANTES de gravarFilhas — aqui só grava o que já veio resolvido.
  for (const p of phones) {
    await client.query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clientId, p.label, p.value, p.is_primary, p.position, p.is_restricted])
  }
  for (const e of emails) {
    await client.query(
      `INSERT INTO person_emails (client_id, label, value, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clientId, e.label, e.value, e.is_primary, e.position, e.is_restricted])
  }
  for (const a of addresses) {
    await client.query(
      `INSERT INTO person_addresses
         (client_id, label, cep, street, number, complement, district, city, uf, is_primary, position, is_restricted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [clientId, a.label, a.cep, a.street, a.number, a.complement, a.district, a.city, a.uf, a.is_primary, a.position, a.is_restricted])
  }
  for (const l of links) {
    await client.query(
      `INSERT INTO person_links (company_client_id, member_client_id, role) VALUES ($1,$2,$3)`,
      [clientId, l.member_client_id, l.role])
  }
}

// Só ADMIN altera is_restricted de uma linha — mesma razão de
// restricted_fields no PUT do cliente: se quem gerencia (estagiário) pudesse
// marcar/desmarcar, esvaziaria a proteção com um PUT qualquer.
//
// Casamento por id: o id que o corpo manda é o que a ficha devolveu (GET
// .../:id). Linha sem id (nova) ou com id que não bate com nenhuma linha
// existente nasce não-restrita — a menos que o próprio admin marque na
// criação. `existentesPorId` já reflete o estado ANTES deste PUT (gravarFilhas
// substitui tudo: os ids antigos não sobrevivem ao DELETE+INSERT).
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

// Linhas completas do cliente ANTES deste PUT — resolverRestricaoLinhas casa
// por id, e preservarLinhasInvisiveis precisa dos dados inteiros (não só
// id/is_restricted) para reinserir uma linha que o corpo nem mencionou.
async function carregarLinhasAtuais(clientId) {
  if (!clientId) return { phones: [], emails: [], addresses: [] }
  const [{ rows: phones }, { rows: emails }, { rows: addresses }] = await Promise.all([
    query('SELECT * FROM person_phones WHERE client_id = $1', [clientId]),
    query('SELECT * FROM person_emails WHERE client_id = $1', [clientId]),
    query('SELECT * FROM person_addresses WHERE client_id = $1', [clientId]),
  ])
  return { phones, emails, addresses }
}

const porId = (linhas) => Object.fromEntries(linhas.map((l) => [l.id, l]))

// O não-admin não VÊ a linha restrita (filtrarLinhasRestritas some com ela na
// ficha) — então o formulário dele nunca a mostra, e um PUT construído a
// partir do que ele viu simplesmente não a menciona. Sem isto, o DELETE+INSERT
// de gravarFilhas apagaria a linha de vez (pior que só perder a marcação: a
// perderia inteira). Ela volta intacta, como se ele nunca tivesse mexido nela.
//
// Se a linha perdida era a principal no banco, ela CONTINUA sendo — o
// não-admin não sabia disso para escolher outra, e temos só uma principal por
// dono (índice único da 041). Por isso zeramos is_primary do que ele mandou.
function preservarLinhasInvisiveis(itensSubmetidos, linhasAtuais, isAdminUser) {
  if (isAdminUser) return itensSubmetidos // admin vê tudo; o que ele omitiu foi decisão dele.

  const idsSubmetidos = new Set(itensSubmetidos.filter((i) => i.id).map((i) => i.id))
  const perdidas = linhasAtuais.filter((l) => l.is_restricted && !idsSubmetidos.has(l.id))
  if (perdidas.length === 0) return itensSubmetidos

  const restauraPrincipal = perdidas.some((l) => l.is_primary)
  const base = restauraPrincipal
    ? itensSubmetidos.map((i) => ({ ...i, is_primary: false }))
    : itensSubmetidos

  return [...base, ...perdidas]
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
    // $1 é o isAdmin — usado tanto no filtro de anexos restritos quanto no
    // agregador de campos restritos (ver abaixo).
    let sql = `SELECT c.id, c.name, c.person_type, c.notes, c.cpf, c.rg, c.birth_date,
                      c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual, c.founded_date,
                      c.admin_only, c.created_at, c.updated_at,
                      COALESCE(ac.attachment_count, 0)::int AS attachment_count,
                      pp.value AS primary_phone,
                      pe.value AS primary_email,
                      pa.street AS primary_address,
                      rf.campos AS campos
               FROM clients c
               LEFT JOIN LATERAL (
                 -- Anexo restrito não conta na contagem de quem não pode vê-lo.
                 SELECT COUNT(*)::int AS attachment_count
                 FROM client_attachments a
                 WHERE a.client_id = c.id AND (a.is_restricted = false OR $1 = true)
               ) ac ON true
               LEFT JOIN LATERAL (
                 -- Achado do reinventário de 19/08/2026: sem o filtro de
                 -- is_restricted aqui, a linha principal marcada como restrita
                 -- vazava no resumo da listagem mesmo escondida na ficha. A
                 -- ordem (is_primary DESC) escolhe a próxima visível quando a
                 -- principal de verdade é restrita — mesmo espírito de
                 -- filtrarLinhasRestritas() em personVisibility.js.
                 SELECT value FROM person_phones
                 WHERE client_id = c.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pp ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_emails
                 WHERE client_id = c.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pe ON true
               LEFT JOIN LATERAL (
                 SELECT street FROM person_addresses
                 WHERE client_id = c.id AND (is_restricted = false OR $1 = true)
                 ORDER BY is_primary DESC, position LIMIT 1
               ) pa ON true
               LEFT JOIN LATERAL (
                 -- Agrega os campos restritos num array só, sem N+1.
                 SELECT array_agg(field_name) AS campos
                 FROM person_restricted_fields WHERE client_id = c.id
               ) rf ON true`
    const conditions = []
    const params = [isAdmin(req.profile)]

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
    const restritosPorId = {}
    for (const r of rows) restritosPorId[r.id] = r.campos || []
    // `campos` é dado interno (usado só para montar o mapa acima) — não vai
    // para a resposta.
    for (const r of rows) delete r.campos
    return res.json(aplicarVisibilidadeEmLista(req.profile, rows, restritosPorId))
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

    const [{ rows: phones }, { rows: emails }, { rows: addresses }, { rows: links }, { rows: projects }, { rows: restritosRows }] = await Promise.all([
      // is_restricted precisa vir junto: filtrarLinhasRestritas() decide por ela.
      query(`SELECT id, label, value, is_primary, position, is_restricted FROM person_phones
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, value, is_primary, position, is_restricted FROM person_emails
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, cep, street, number, complement, district, city, uf, is_primary, position, is_restricted
               FROM person_addresses WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT l.id, l.role, l.member_client_id, m.name AS member_name, m.person_type AS member_person_type
               FROM person_links l
               JOIN clients m ON m.id = l.member_client_id
              WHERE l.company_client_id = $1 ORDER BY l.role, m.name`, [req.params.id]),
      // Todos os papéis contam (contratante_principal, investidor, etc.) — o
      // contador da ficha da pessoa não é só "quando é o contratante principal".
      query(`SELECT p.id, p.name, p.status, pc.role
               FROM project_clients pc JOIN projects p ON p.id = pc.project_id
              WHERE pc.client_id = $1 AND p.deleted_at IS NULL
              ORDER BY p.created_at DESC`, [req.params.id]),
      query(`SELECT field_name FROM person_restricted_fields WHERE client_id = $1`, [req.params.id]),
    ])
    const restritos = restritosRows.map((r) => r.field_name)
    // A lista traz só o campo id/label/value; is_primary/is_restricted são
    // atributos DA LINHA — os campos escalares do cliente é que passam pela
    // remoção de chave.
    return res.json({
      ...aplicarVisibilidade(req.profile, cliente, restritos),
      // Só admin recebe a marcação — é quem pode alterá-la (mesma lógica do
      // resto: quem não pode mudar não precisa saber que existe). Sem isto o
      // PUT seguinte reverte a marcação em silêncio: o front não tinha como
      // saber o que estava restrito e mandava o palpite padrão.
      ...(isAdmin(req.profile) ? { restricted_fields: restritos } : {}),
      phones: filtrarLinhasRestritas(req.profile, phones),
      emails: filtrarLinhasRestritas(req.profile, emails),
      addresses: filtrarLinhasRestritas(req.profile, addresses),
      links,
      projects,
      project_count: projects.length,
    })
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
  // Criação: não há linha anterior para casar por id — resolverRestricaoLinhas
  // com {} trata toda linha como nova (nasce não-restrita, salvo se o próprio
  // admin marcar já na criação).
  parsed.phones = resolverRestricaoLinhas(parsed.phones, {}, isAdmin(req.profile))
  parsed.emails = resolverRestricaoLinhas(parsed.emails, {}, isAdmin(req.profile))
  parsed.addresses = resolverRestricaoLinhas(parsed.addresses, {}, isAdmin(req.profile))

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
      // "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários."
      for (const campo of PADRAO_RESTRITO) {
        await client.query(
          `INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [novo.id, campo])
      }
      return novo
    })
    // BLOQUEADOR 1 (revisão final): a resposta do POST também é leitura — o
    // caminho de escrita não estava passando por aplicarVisibilidade, e o
    // RETURNING * ecoava CPF/RG/dados bancários crus na rede mesmo para quem
    // não pode vê-los. Na criação os campos recém-marcados são sempre
    // PADRAO_RESTRITO (só eles são gravados em person_restricted_fields aqui).
    return res.status(201).json(aplicarVisibilidade(req.profile, cliente, PADRAO_RESTRITO))
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /admin/clients')
    return res.status(400).json({ error: err.message })
  }
})

router.put('/admin/clients/:id', requireAuth, requireCanManageClients, async (req, res) => {
  const parsed = parseClientPayload(req.body)
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
      `SELECT * FROM clients WHERE id = $1`,
      [req.params.id],
    )
    const existing = existingRows[0]
    // Não-admin não enxerga (nem edita) clientes restritos.
    if (!existing || (existing.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }
    // Só admin altera o flag; os demais preservam o valor atual.
    const adminOnly = isAdmin(req.profile) ? Boolean(req.body.admin_only) : existing.admin_only

    // Campo restringível que o corpo nem tocou preserva o valor atual. Sem
    // isto, um PUT parcial (ex.: o admin só ajustando restricted_fields, sem
    // reenviar cada campo) apagaria tudo que ele não tocou — parseClientPayload
    // trata "chave ausente" e "chave vazia" da mesma forma (ambos viram null),
    // então "ausente" tem que ser tratado ANTES de chegar lá.
    for (const campo of CAMPOS_RESTRINGIVEIS) {
      if (req.body[campo] === undefined) parsed.data[campo] = existing[campo]
    }

    // Quem não podia VER o campo não pode APAGÁ-LO sem querer — mesmo que o
    // corpo tenha mandado algo (uma chamada direta à API, por exemplo: o
    // formulário do colaborador nem tem o campo, mas nada impede o corpo de
    // trazê-lo). Só quem recebeu o valor tem permissão de mudá-lo.
    if (!isAdmin(req.profile)) {
      const { rows: restritosRows } = await query(
        `SELECT field_name FROM person_restricted_fields WHERE client_id = $1`, [req.params.id])
      for (const { field_name: campo } of restritosRows) {
        if (CAMPOS_RESTRINGIVEIS.has(campo)) parsed.data[campo] = existing[campo]
      }
    }

    // Mesmo raciocínio, um nível abaixo: is_restricted de cada linha de
    // telefone/e-mail/endereço só muda se quem manda for admin. Os demais
    // preservam o valor atual (casado por id) — resolverRestricaoLinhas. E uma
    // linha restrita que o não-admin nem viu tem que sobreviver ao PUT mesmo
    // sem aparecer no corpo — preservarLinhasInvisiveis.
    const atuais = await carregarLinhasAtuais(req.params.id)
    const admin = isAdmin(req.profile)
    parsed.phones = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.phones, porId(atuais.phones), admin), atuais.phones, admin)
    parsed.emails = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.emails, porId(atuais.emails), admin), atuais.emails, admin)
    parsed.addresses = preservarLinhasInvisiveis(
      resolverRestricaoLinhas(parsed.addresses, porId(atuais.addresses), admin), atuais.addresses, admin)

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

      // Regrava a marcação de restrição só quando ela veio no corpo — e só
      // com os nomes que estão na allowlist (o resto foi ignorado acima).
      if (req.body.restricted_fields !== undefined) {
        const campos = (req.body.restricted_fields || []).filter((c) => CAMPOS_RESTRINGIVEIS.has(c))
        await client.query('DELETE FROM person_restricted_fields WHERE client_id = $1', [req.params.id])
        for (const campo of campos) {
          await client.query(
            `INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,$2)`,
            [req.params.id, campo])
        }
      }

      return atualizado
    })

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    // BLOQUEADOR 1 (revisão final): mesmo vazamento do POST, aqui na resposta
    // do PUT — RETURNING * saía cru, sem passar por aplicarVisibilidade. Busca
    // os campos restritos JÁ ATUALIZADOS (o corpo pode ter alterado
    // restricted_fields agora mesmo) para filtrar a resposta corretamente.
    const { rows: restritosAtuaisRows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1`, [req.params.id])
    const restritosAtuais = restritosAtuaisRows.map((r) => r.field_name)
    return res.json(aplicarVisibilidade(req.profile, cliente, restritosAtuais))
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

// Ver a lista é o mesmo modelo da ficha: qualquer autenticado pode olhar
// (requireCanViewClients), e é a condição is_restricted no SELECT que decide
// o que aparece. Gerir (upload) continua em requireCanManageClients.
router.get('/admin/clients/:id/attachments', requireAuth, requireCanViewClients, async (req, res) => {
  try {
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    const { rows } = await query(
      `SELECT a.id, a.file_url, a.file_name, a.file_size, a.mime_type, a.is_restricted, a.created_at,
              a.uploaded_by, u.name AS uploaded_by_name
       FROM client_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.client_id = $1 AND (a.is_restricted = false OR $2 = true)
       ORDER BY a.created_at DESC`,
      [req.params.id, isAdmin(req.profile)],
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

// Mesmo raciocínio do GET: o gate de entrada é "pode ver" — quem pode de fato
// excluir é decidido linha a linha (uploader ou admin) logo abaixo. Sem isto,
// um colaborador nem chegaria a essa checagem, e o 403 genérico do meio do
// caminho esconderia a diferença entre "não é seu" e "está restrito" (404).
router.delete('/admin/clients/:id/attachments/:attId', requireAuth, requireCanViewClients, async (req, res) => {
  try {
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    // Anexo restrito: mesmo 404 de "não existe". O id é adivinhável por quem
    // já viu o anexo antes da restrição entrar (ou por um log) — esconder só
    // da lista não fecha esse acesso direto.
    const { rows } = await query(
      `SELECT id, file_url, uploaded_by FROM client_attachments
        WHERE id = $1 AND client_id = $2 AND (is_restricted = false OR $3 = true)`,
      [req.params.attId, req.params.id, isAdmin(req.profile)],
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

// Só admin marca/desmarca um anexo como restrito — mesma razão de
// restricted_fields no PUT do cliente: se quem gerencia (estagiário) pudesse
// alternar, esvaziaria a proteção.
router.put('/admin/clients/:id/attachments/:attId', requireAuth, requireCanManageClients, async (req, res) => {
  try {
    if (!isAdmin(req.profile)) {
      return res.status(403).json({ error: 'Só o administrador altera a visibilidade do anexo.' })
    }
    const client = await loadVisibleClient(req)
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })

    const { rows } = await query(
      `UPDATE client_attachments SET is_restricted = $1 WHERE id = $2 AND client_id = $3
       RETURNING id, file_url, file_name, file_size, mime_type, is_restricted, created_at, uploaded_by`,
      [Boolean(req.body.is_restricted), req.params.attId, req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Anexo não encontrado.' })
    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /admin/clients/:id/attachments/:attId')
    return res.status(400).json({ error: err.message })
  }
})

export default router
