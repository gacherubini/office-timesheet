import { Router } from 'express'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'
import { logger } from '../lib/logger.js'

const router = Router()

const VALID_PRIORITY = ['low', 'medium', 'high']

// Normaliza/valida a lista de etapas do template (migration 050). Cada etapa
// vem do catálogo (catalog_id, herdando nome/ordem — mesma regra da rota de
// etapas do projeto, routes/projectStages.js) ou é livre (name obrigatório).
function parseStages(rawStages) {
  if (rawStages === undefined) return { stages: [] }
  if (!Array.isArray(rawStages)) return { error: 'stages deve ser uma lista.' }
  const stages = []
  const vistos = new Set()
  for (let i = 0; i < rawStages.length; i++) {
    const raw = rawStages[i]
    const name = (raw?.name || '').trim() || null
    const catalog_id = raw?.catalog_id || null
    if (!catalog_id && !name) {
      return { error: 'Toda etapa do template precisa de name (ou vir do catálogo).' }
    }
    const chave = name || catalog_id
    if (vistos.has(chave)) return { error: 'A mesma etapa aparece duas vezes no template.' }
    vistos.add(chave)
    // position fica null quando não informada: insertStages decide o default
    // (ordem do catálogo, se houver; senão a posição na lista).
    stages.push({ catalog_id, name, position: Number.isInteger(raw?.position) ? raw.position : null })
  }
  return { stages }
}

// Normaliza/valida a lista de itens (tasks) do template. Retorna { error } ou { items }.
// `stage_index` (opcional) aponta pro índice dentro de `stages` no mesmo
// corpo — vira template_stage_id depois que as etapas são gravadas.
function parseItems(rawItems, totalStages) {
  if (rawItems === undefined) return { items: [] }
  if (!Array.isArray(rawItems)) return { error: 'items deve ser uma lista.' }
  const items = []
  for (const raw of rawItems) {
    const title = (raw?.title || '').trim()
    if (!title) return { error: 'Toda task do template precisa de um título.' }
    const priority = raw?.priority || 'medium'
    if (!VALID_PRIORITY.includes(priority)) {
      return { error: 'Prioridade inválida. Use low, medium ou high.' }
    }
    let stageIndex = null
    if (raw?.stage_index !== undefined && raw?.stage_index !== null) {
      stageIndex = raw.stage_index
      if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= totalStages) {
        return { error: 'stage_index inválido.' }
      }
    }
    items.push({
      title,
      description: (raw?.description || '').trim() || null,
      priority,
      stageIndex,
    })
  }
  return { items }
}

// Lista templates com contagem de itens.
router.get('/project-templates', requireAuth, requireProjectManagement, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.name, t.description, t.created_at, t.updated_at,
              COALESCE(ic.item_count, 0)::int AS item_count
       FROM project_templates t
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS item_count
         FROM project_template_items i WHERE i.template_id = t.id
       ) ic ON true
       ORDER BY t.name ASC`,
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /project-templates')
    return res.status(400).json({ error: err.message })
  }
})

// Template + seus itens (ordenados).
router.get('/project-templates/:id', requireAuth, requireProjectManagement, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, description, created_at, updated_at FROM project_templates WHERE id = $1',
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Template não encontrado.' })
    // Etapas primeiro (mesma ordem da geração em POST /projects), depois os
    // itens — cada item carrega template_stage_id (pode ser null: template
    // antigo, ver migration 050).
    const { rows: stages } = await query(
      `SELECT id, catalog_id, name, position FROM project_template_stages
       WHERE template_id = $1 ORDER BY position, name`,
      [req.params.id],
    )
    const { rows: items } = await query(
      `SELECT id, title, description, priority, position, template_stage_id
       FROM project_template_items WHERE template_id = $1
       ORDER BY position, created_at`,
      [req.params.id],
    )
    return res.json({ ...rows[0], stages, items })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /project-templates/:id')
    return res.status(400).json({ error: err.message })
  }
})

// Cria template + etapas + itens (transação). Etapas são gravadas ANTES dos
// itens — mesma ordem de POST /projects — pra que stage_index vire
// template_stage_id de verdade.
router.post('/project-templates', requireAuth, requireProjectManagement, async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Informe o nome do template.' })
  const parsedStages = parseStages(req.body?.stages)
  if (parsedStages.error) return res.status(400).json({ error: parsedStages.error })
  const parsed = parseItems(req.body?.items, parsedStages.stages.length)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const description = (req.body?.description || '').trim() || null

  try {
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO project_templates (name, description, created_by)
         VALUES ($1, $2, $3) RETURNING id, name, description, created_at, updated_at`,
        [name, description, req.profile.id],
      )
      const tpl = rows[0]
      const stageIds = await insertStages(client, tpl.id, parsedStages.stages)
      await insertItems(client, tpl.id, parsed.items, stageIds)
      return tpl
    })
    return res.status(201).json(created)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /project-templates')
    return res.status(400).json({ error: err.message })
  }
})

// Atualiza nome/descrição e SUBSTITUI itens (transação). As etapas só são
// substituídas se `stages` vier no corpo — ver comentário logo abaixo.
router.put('/project-templates/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Informe o nome do template.' })
  const parsedStages = parseStages(req.body?.stages)
  if (parsedStages.error) return res.status(400).json({ error: parsedStages.error })
  const description = (req.body?.description || '').trim() || null

  // `stages` ausente no corpo PRESERVA as etapas atuais do template, em vez
  // de apagá-las. Mesmo padrão de "chave ausente preserva" que routes/clients.js
  // usa no PUT (ali, restricted_fields só é regravado quando a chave vem no
  // corpo — ver o comentário acima de "if (req.body.restricted_fields...)").
  // Sem isto, TemplateManager.jsx — que ainda não manda `stages` — apagava,
  // no primeiro save, as etapas que um template tivesse ganhado por outra via
  // (API direta, seed). A validação de items (parseItems) precisa do total de
  // etapas DISPONÍVEIS para checar stage_index, por isso só roda dentro da
  // transação agora (o total depende do banco quando `stages` está ausente).
  const stagesInformadas = req.body?.stages !== undefined

  try {
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE project_templates SET name = $1, description = $2 WHERE id = $3
         RETURNING id, name, description, created_at, updated_at`,
        [name, description, req.params.id],
      )
      if (!rows[0]) return null

      let stageIds
      if (stagesInformadas) {
        // items primeiro (FK template_stage_id -> project_template_stages) e
        // depois as etapas: ON DELETE CASCADE de project_template_items já
        // cuidaria disso, mas apagar na ordem certa evita depender só do CASCADE.
        await client.query('DELETE FROM project_template_items WHERE template_id = $1', [req.params.id])
        await client.query('DELETE FROM project_template_stages WHERE template_id = $1', [req.params.id])
        stageIds = await insertStages(client, req.params.id, parsedStages.stages)
      } else {
        // Preserva as etapas: só busca os ids na mesma ordem do GET (position,
        // name), pra que um `stage_index` em `items` — se vier — continue
        // apontando pra etapa certa mesmo sem `stages` no corpo.
        const { rows: etapasAtuais } = await client.query(
          `SELECT id FROM project_template_stages WHERE template_id = $1 ORDER BY position, name`,
          [req.params.id],
        )
        await client.query('DELETE FROM project_template_items WHERE template_id = $1', [req.params.id])
        stageIds = etapasAtuais.map((s) => s.id)
      }

      const parsed = parseItems(req.body?.items, stageIds.length)
      if (parsed.error) throw new Error(parsed.error)
      await insertItems(client, req.params.id, parsed.items, stageIds)
      return rows[0]
    })
    if (!updated) return res.status(404).json({ error: 'Template não encontrado.' })
    return res.json(updated)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /project-templates/:id')
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/project-templates/:id', requireAuth, requireProjectManagement, async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM project_templates WHERE id = $1 RETURNING id',
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Template não encontrado.' })
    return res.status(204).send()
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /project-templates/:id')
    return res.status(400).json({ error: err.message })
  }
})

// Grava as etapas do template e devolve os ids na MESMA ordem de entrada —
// é o que permite parseItems().stageIndex virar template_stage_id abaixo.
// Com catalog_id e sem name, herda nome/ordem do catálogo (mesma regra da
// POST /projects/:id/stages em routes/projectStages.js).
async function insertStages(client, templateId, stages) {
  const ids = []
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    let name = stage.name
    let position = stage.position
    if (stage.catalog_id && (!name || position === null)) {
      const { rows: cat } = await client.query(
        'SELECT name, position FROM stage_catalog WHERE id = $1', [stage.catalog_id])
      if (!cat[0]) throw new Error('Etapa do catálogo não encontrada.')
      name = name || cat[0].name
      if (position === null) position = cat[0].position
    }
    if (position === null) position = i
    const { rows } = await client.query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [templateId, stage.catalog_id, name, position],
    )
    ids.push(rows[0].id)
  }
  return ids
}

async function insertItems(client, templateId, items, stageIds = []) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const templateStageId = item.stageIndex !== null && item.stageIndex !== undefined
      ? stageIds[item.stageIndex]
      : null
    await client.query(
      `INSERT INTO project_template_items (template_id, title, description, priority, position, template_stage_id)
       VALUES ($1, $2, $3, $4::task_priority, $5, $6)`,
      [templateId, item.title, item.description, item.priority, i, templateStageId],
    )
  }
}

export default router
