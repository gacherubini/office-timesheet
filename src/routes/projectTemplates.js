import { Router } from 'express'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'

const router = Router()

const VALID_PRIORITY = ['low', 'medium', 'high']

// Normaliza/valida a lista de itens (tasks) do template. Retorna { error } ou { items }.
function parseItems(rawItems) {
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
    items.push({ title, description: (raw?.description || '').trim() || null, priority })
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
    console.error('Erro em GET /project-templates:', err)
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
    const { rows: items } = await query(
      `SELECT id, title, description, priority, position
       FROM project_template_items WHERE template_id = $1
       ORDER BY position, created_at`,
      [req.params.id],
    )
    return res.json({ ...rows[0], items })
  } catch (err) {
    console.error('Erro em GET /project-templates/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

// Cria template + itens (transação).
router.post('/project-templates', requireAuth, requireProjectManagement, async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Informe o nome do template.' })
  const parsed = parseItems(req.body?.items)
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
      await insertItems(client, tpl.id, parsed.items)
      return tpl
    })
    return res.status(201).json(created)
  } catch (err) {
    console.error('Erro em POST /project-templates:', err)
    return res.status(400).json({ error: err.message })
  }
})

// Atualiza nome/descrição e SUBSTITUI todos os itens (transação).
router.put('/project-templates/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Informe o nome do template.' })
  const parsed = parseItems(req.body?.items)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const description = (req.body?.description || '').trim() || null

  try {
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE project_templates SET name = $1, description = $2 WHERE id = $3
         RETURNING id, name, description, created_at, updated_at`,
        [name, description, req.params.id],
      )
      if (!rows[0]) return null
      await client.query('DELETE FROM project_template_items WHERE template_id = $1', [req.params.id])
      await insertItems(client, req.params.id, parsed.items)
      return rows[0]
    })
    if (!updated) return res.status(404).json({ error: 'Template não encontrado.' })
    return res.json(updated)
  } catch (err) {
    console.error('Erro em PUT /project-templates/:id:', err)
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
    console.error('Erro em DELETE /project-templates/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

async function insertItems(client, templateId, items) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    await client.query(
      `INSERT INTO project_template_items (template_id, title, description, priority, position)
       VALUES ($1, $2, $3, $4::task_priority, $5)`,
      [templateId, item.title, item.description, item.priority, i],
    )
  }
}

export default router
