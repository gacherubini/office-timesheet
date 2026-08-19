import { Router } from 'express'
import multer from 'multer'
import { query, withTransaction } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl, assertSafeUploadMime } from '../lib/storage.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'
import { canManageProjects, isAdmin } from '../lib/permissions.js'
import { logger } from '../lib/logger.js'
import { dateInSaoPaulo, yearMonthInSaoPaulo } from '../lib/dates.js'

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

// Documentos do projeto: pdf/docx/imagens (SVG/HTML bloqueados em storage).
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    try {
      assertSafeUploadMime(file.mimetype)
      cb(null, true)
    } catch (err) {
      cb(err)
    }
  },
})

const router = Router()

const PAPEIS_CLIENTE = new Set(['contratante_principal', 'contratante', 'investidor', 'representante'])

// Mesma forma de normalizarContatos (lib/personContacts.js): valida tudo ANTES
// de abrir a transação e garante exatamente um principal, promovendo o primeiro
// se ninguém marcar. O card e o cabeçalho do projeto precisam de um principal.
function normalizarClientesDoProjeto(lista) {
  const entrada = Array.isArray(lista) ? lista : []
  if (entrada.length === 0) return { error: 'O projeto precisa de ao menos um cliente.' }

  const itens = []
  const vistos = new Set()
  for (const bruto of entrada) {
    const clientId = bruto?.client_id
    if (!clientId) return { error: 'Todo vínculo precisa apontar para um cliente cadastrado.' }
    if (vistos.has(clientId)) return { error: 'O mesmo cliente aparece duas vezes no projeto.' }
    vistos.add(clientId)
    const role = bruto.role || 'contratante'
    if (!PAPEIS_CLIENTE.has(role)) return { error: `Papel de cliente inválido: ${role}.` }
    itens.push({ client_id: clientId, role, is_primary: Boolean(bruto.is_primary) })
  }

  const principais = itens.filter((i) => i.is_primary)
  if (principais.length > 1) return { error: 'Marque apenas um cliente como principal.' }
  if (principais.length === 0) itens[0].is_primary = true

  return { itens }
}

// Compatibilidade: corpo no formato antigo (client_id solto) vira uma lista de
// um item, contratante principal. Chamadas antigas do front migram na Task 10.
function clientesDoCorpo(body) {
  if (Array.isArray(body.clients)) return body.clients
  if (body.client_id) return [{ client_id: body.client_id, role: 'contratante_principal', is_primary: true }]
  return []
}

// Regrava os vínculos e SINCRONIZA projects.client_id/client com o principal.
// Na mesma transação, e na rota — não em trigger (ver comentário da 045).
async function gravarClientesDoProjeto(client, projectId, itens) {
  await client.query('DELETE FROM project_clients WHERE project_id = $1', [projectId])
  for (const i of itens) {
    await client.query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary) VALUES ($1,$2,$3,$4)`,
      [projectId, i.client_id, i.role, i.is_primary])
  }
  const principal = itens.find((i) => i.is_primary)
  const { rows } = await client.query('SELECT name FROM clients WHERE id = $1', [principal.client_id])
  await client.query(
    `UPDATE projects SET client_id = $1, client = $2 WHERE id = $3`,
    [principal.client_id, rows[0]?.name || null, projectId])
}

// Documentos: gestor/admin, ou quem já apontou/tem task no projeto (não qualquer UUID).
async function canAccessProjectDocuments(profile, projectId) {
  if (canManageProjects(profile) || isAdmin(profile)) return true
  const { rows } = await query(
    `SELECT 1
       WHERE EXISTS (
         SELECT 1 FROM time_entries te
         WHERE te.project_id = $1 AND te.user_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.project_id = $1 AND t.assignee_id = $2
       )`,
    [projectId, profile.id],
  )
  return rows.length > 0
}

router.get('/projects', requireAuth, async (req, res) => {
  try {
    // Contato de cliente restrito (admin_only) só sai para admin. Sem isso, o
    // gate de /admin/clients viraria porta da frente fechada e dos fundos
    // aberta: o cliente some da tela de Pessoas mas telefone/e-mail/endereço
    // continuam saindo por aqui. O NOME segue visível — ele é denormalizado em
    // projects.client e identifica o projeto no quadro.
    //
    // Desde a 043, clients.phone/email/address estão CONGELADAS (existem só
    // para a migração ser reversível, ninguém escreve mais nelas). O contato
    // agora mora em person_phones/person_emails/person_addresses, uma linha
    // marcada is_primary por dono — daí o LEFT JOIN LATERAL buscando a
    // principal de cada tabela filha em vez das colunas antigas de `clients`.
    const { rows } = await query(
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.briefing,
              CASE WHEN $1 OR NOT c.admin_only THEN pp.value  END AS client_phone,
              CASE WHEN $1 OR NOT c.admin_only THEN pe.value  END AS client_email,
              CASE WHEN $1 OR NOT c.admin_only THEN pa.street END AS client_address,
              p.created_at, p.updated_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         -- Mesmo achado do reinventário de 19/08/2026 que corrigiu
         -- GET /admin/clients e GET /admin/suppliers: sem o filtro de
         -- is_restricted aqui, a linha PRINCIPAL marcada como restrita vazava
         -- mesmo com o cliente inteiro não sendo admin_only. A ordem
         -- (is_primary DESC) escolhe a próxima visível quando a principal de
         -- verdade é restrita — mesmo padrão de filtrarLinhasRestritas() em
         -- personVisibility.js.
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
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
      [isAdmin(req.profile)],
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

// Ficha de UM projeto. Não existia antes da task 2 — a lista (GET /projects)
// não devolve os vários contratantes; a ficha nova de cliente e a tela de
// edição de projeto precisam de `clients[]`, então a rota nasce aqui.
router.get('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { rows: projRows } = await query(
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.briefing,
              p.created_at, p.updated_at
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [req.params.id],
    )
    const project = projRows[0]
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' })

    const { rows: clients } = await query(
      `SELECT pc.client_id, pc.role, pc.is_primary, c.name
         FROM project_clients pc JOIN clients c ON c.id = pc.client_id
        WHERE pc.project_id = $1 ORDER BY pc.is_primary DESC, c.name`,
      [req.params.id],
    )

    return res.json({ ...project, clients })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/projects', requireAuth, requireProjectManagement, async (req, res) => {
  const { name, address, start_date, template_id } = req.body

  // Status nasce sempre "active"; a evolução (concluído/excluído) é tratada
  // depois. Cliente vinculado e data de início são obrigatórios.
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Informe o nome do projeto.' })
  }
  const normClientes = normalizarClientesDoProjeto(clientesDoCorpo(req.body))
  if (normClientes.error) {
    return res.status(400).json({ error: normClientes.error })
  }
  if (!start_date) {
    return res.status(400).json({ error: 'Informe a data de início.' })
  }

  try {
    // Todo cliente citado precisa existir — checado ANTES de abrir a transação.
    for (const item of normClientes.itens) {
      const { rows: cli } = await query('SELECT id FROM clients WHERE id = $1', [item.client_id])
      if (!cli[0]) {
        return res.status(400).json({ error: 'Cliente não encontrado.' })
      }
    }

    // Etapas e itens do template (se houver) — validados antes de abrir a
    // transação. As etapas vêm PRIMEIRO: a tarefa precisa do stage_id para
    // nascer (ver geração dentro da transação, abaixo).
    let templateStages = []
    let templateItems = []
    if (template_id) {
      const { rows: tpl } = await query('SELECT id FROM project_templates WHERE id = $1', [template_id])
      if (!tpl[0]) {
        return res.status(400).json({ error: 'Template não encontrado.' })
      }
      const { rows: stages } = await query(
        `SELECT id, catalog_id, name, position FROM project_template_stages
         WHERE template_id = $1 ORDER BY position, name`,
        [template_id],
      )
      templateStages = stages
      const { rows: items } = await query(
        `SELECT title, description, priority, template_stage_id FROM project_template_items
         WHERE template_id = $1 ORDER BY position, created_at`,
        [template_id],
      )
      templateItems = items
    }

    const project = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO projects (name, address, start_date, status, sale_value)
         VALUES ($1, $2, $3, 'active', 0)
         RETURNING id, name, client, client_id, address, start_date, status, image_url, created_at, updated_at`,
        [name.trim(), address?.trim() || null, start_date],
      )
      const created = rows[0]

      await gravarClientesDoProjeto(client, created.id, normClientes.itens)

      // Etapas do template primeiro: a tarefa precisa do stage_id para nascer
      // ("o projeto nasce estruturado em vez de em branco" — item 8 do PDF).
      const etapaPorTemplateStage = new Map()
      for (const ts of templateStages) {
        const { rows: st } = await client.query(
          `INSERT INTO project_stages (project_id, catalog_id, name, position)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [created.id, ts.catalog_id, ts.name, ts.position],
        )
        etapaPorTemplateStage.set(ts.id, st[0].id)
      }

      // Item de template ANTIGO (sem etapa) cai numa etapa coringa, criada só
      // se realmente houver item órfão — projeto sem template não ganha
      // "Sem etapa" à toa.
      let semEtapaId = null
      async function etapaDoItem(item) {
        if (item.template_stage_id) return etapaPorTemplateStage.get(item.template_stage_id)
        if (!semEtapaId) {
          const { rows: se } = await client.query(
            `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Sem etapa',999) RETURNING id`,
            [created.id],
          )
          semEtapaId = se[0].id
        }
        return semEtapaId
      }

      // Gera as tarefas do template, em ordem, na coluna "A fazer".
      for (let i = 0; i < templateItems.length; i++) {
        const item = templateItems[i]
        const stageId = await etapaDoItem(item)
        await client.query(
          `INSERT INTO tasks (project_id, title, description, priority, status, position, stage_id, created_by)
           VALUES ($1, $2, $3, $4::task_priority, 'todo', $5, $6, $7)`,
          [created.id, item.title, item.description || null, item.priority || 'medium', i, stageId, req.profile.id],
        )
      }

      // gravarClientesDoProjeto já ajustou client/client_id no banco; devolve
      // o registro atualizado.
      const { rows: atualizado } = await client.query(
        `SELECT id, name, client, client_id, address, start_date, status, image_url, created_at, updated_at
           FROM projects WHERE id = $1`,
        [created.id],
      )
      return atualizado[0]
    })

    return res.status(201).json(project)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects')
    return res.status(400).json({ error: err.message })
  }
})

router.put('/projects/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const { id } = req.params
  const { name, address, start_date, status, briefing } = req.body

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

  // Clientes só entram na atualização se o corpo trouxer `clients` (formato
  // novo) ou `client_id` (formato antigo — ver clientesDoCorpo). Sem isso, o
  // PUT não mexe nos vínculos existentes.
  const atualizaClientes = req.body.clients !== undefined || req.body.client_id !== undefined
  let normClientes = null
  if (atualizaClientes) {
    normClientes = normalizarClientesDoProjeto(clientesDoCorpo(req.body))
    if (normClientes.error) {
      return res.status(400).json({ error: normClientes.error })
    }
  }

  if (Object.keys(updates).length === 0 && !atualizaClientes) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  try {
    if (atualizaClientes) {
      // Todo cliente citado precisa existir — checado ANTES de abrir a transação.
      for (const item of normClientes.itens) {
        const { rows: cli } = await query('SELECT id FROM clients WHERE id = $1', [item.client_id])
        if (!cli[0]) {
          return res.status(400).json({ error: 'Cliente não encontrado.' })
        }
      }
    }

    const project = await withTransaction(async (client) => {
      let atual
      if (Object.keys(updates).length > 0) {
        const setClauses = []
        const values = []
        let paramCount = 1

        Object.entries(updates).forEach(([key, value]) => {
          setClauses.push(`${key} = $${paramCount}`)
          values.push(value)
          paramCount++
        })

        values.push(id)
        const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING id`
        const { rows } = await client.query(sql, values)
        atual = rows[0]
      } else {
        const { rows } = await client.query(
          'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL', [id])
        atual = rows[0]
      }
      if (!atual) return null

      // gravarClientesDoProjeto sincroniza client_id/client com o principal
      // na mesma transação (ver comentário da 045).
      if (atualizaClientes) {
        await gravarClientesDoProjeto(client, id, normClientes.itens)
      }

      const { rows: full } = await client.query(
        `SELECT id, name, client, client_id, address, start_date, status, image_url, briefing, created_at, updated_at
           FROM projects WHERE id = $1`,
        [id],
      )
      return full[0]
    })

    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' })
    }

    return res.json(project)
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

    // Upload primeiro; só apaga a antiga depois do UPDATE (evita perder imagem se upload falhar).
    const { url, key: newKey } = await uploadFile('projects', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    try {
      const { rows } = await query(
        `UPDATE projects
         SET image_url = $1
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING id, name, client, status, image_url, created_at, updated_at`,
        [url, id],
      )

      if (project.image_url) {
        const oldKey = extractKeyFromUrl(project.image_url)
        if (oldKey && oldKey !== newKey) await deleteFile(oldKey)
      }

      return res.json(rows[0])
    } catch (err) {
      await deleteFile(newKey)
      throw err
    }
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects/:id/image')
    return res.status(400).json({ error: err.message })
  }
})

// ─── DOCUMENTOS DO PROJETO ──────────────────────────────────────────
router.get('/projects/:id/documents', requireAuth, async (req, res) => {
  try {
    const { rows: proj } = await query(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    )
    if (!proj[0]) return res.status(404).json({ error: 'Projeto não encontrado.' })

    if (!(await canAccessProjectDocuments(req.profile, req.params.id))) {
      return res.status(403).json({ error: 'Sem permissão para ver documentos deste projeto.' })
    }

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
  let uploadedKey = null
  try {
    const { rows: proj } = await query(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    )
    if (!proj[0]) return res.status(404).json({ error: 'Projeto não encontrado.' })

    if (!(await canAccessProjectDocuments(req.profile, req.params.id))) {
      return res.status(403).json({ error: 'Sem permissão para anexar documentos neste projeto.' })
    }

    const { url, key } = await uploadFile('projects', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })
    uploadedKey = key

    const { rows } = await query(
      `INSERT INTO project_documents (project_id, uploaded_by, file_url, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_url, file_name, file_size, mime_type, created_at, uploaded_by`,
      [req.params.id, req.profile.id, url, req.file.originalname, req.file.size, req.file.mimetype],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    if (uploadedKey) await deleteFile(uploadedKey)
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
  const { year: y, month: m } = yearMonthInSaoPaulo()
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const todayStr = dateInSaoPaulo()
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(duration_minutes), 0)::int AS month_minutes,
         COALESCE(SUM(duration_minutes) FILTER (
           WHERE started_at >= ($3::timestamp AT TIME ZONE 'America/Sao_Paulo')
         ), 0)::int AS today_minutes
       FROM time_entries
       WHERE user_id = $1 AND project_id = $2 AND status = 'completed'
         AND started_at >= ($4::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      [req.profile.id, req.params.id, todayStr, monthStart],
    )
    return res.json(rows[0] || { month_minutes: 0, today_minutes: 0 })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id/my-hours')
    return res.status(400).json({ error: err.message })
  }
})

export default router
