import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'
import { logger } from '../lib/logger.js'

const router = Router()

const STATUS_VALIDOS = new Set(['nao_iniciada', 'em_andamento', 'entregue', 'aprovada'])

// Progresso e horas são DERIVADOS, nunca colunas: coluna denormalizada aqui só
// criaria a chance de divergir do que o quadro mostra. As horas saem de graça —
// task_time_logs (migration 012) já amarra tempo à tarefa, e a tarefa agora tem
// etapa. É exatamente o que o PDF prevê: "não exige trabalho adicional além do
// vínculo tarefa → etapa".
const SELECT_ETAPAS = `
  SELECT s.id, s.project_id, s.catalog_id, s.name, s.position, s.due_date,
         s.owner_id, u.name AS owner_name, s.status,
         COALESCE(tc.task_count, 0)::int AS task_count,
         COALESCE(tc.done_count, 0)::int AS done_count,
         COALESCE(hc.total_minutes, 0)::int AS total_minutes
    FROM project_stages s
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS task_count,
             COUNT(*) FILTER (WHERE status = 'done')::int AS done_count
        FROM tasks WHERE stage_id = s.id
    ) tc ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(l.duration_minutes), 0)::int AS total_minutes
        FROM task_time_logs l JOIN tasks t ON t.id = l.task_id
       WHERE t.stage_id = s.id
    ) hc ON true`

router.get('/projects/:id/stages', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `${SELECT_ETAPAS} WHERE s.project_id = $1 ORDER BY s.position, s.name`, [req.params.id])
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id/stages')
    return res.status(400).json({ error: err.message })
  }
})

// Cria etapa no projeto. Com catalog_id, copia nome e ordem do catálogo (a
// cópia é o desenho — ver comentário da migration 048: renomear o catálogo
// depois não pode reescrever a etapa já criada). Sem catalog_id, exige nome:
// é a etapa "extra" que o PDF prevê fora da lista padrão (ex.: "Maquete
// física").
router.post('/projects/:id/stages', requireAuth, requireProjectManagement, async (req, res) => {
  const projectId = req.params.id
  const { catalog_id, name, position, due_date, owner_id, status } = req.body

  if (status !== undefined && !STATUS_VALIDOS.has(status)) {
    return res.status(400).json({ error: 'status inválido. Use nao_iniciada, em_andamento, entregue ou aprovada.' })
  }

  try {
    let nomeFinal = name?.trim() || null
    let posicaoFinal = Number.isInteger(position) ? position : 0
    let catalogIdFinal = null

    if (catalog_id) {
      const { rows: cat } = await query(
        'SELECT id, name, position FROM stage_catalog WHERE id = $1', [catalog_id])
      if (!cat[0]) {
        return res.status(400).json({ error: 'Etapa do catálogo não encontrada.' })
      }
      catalogIdFinal = cat[0].id
      nomeFinal = nomeFinal || cat[0].name
      posicaoFinal = Number.isInteger(position) ? position : cat[0].position
    }

    if (!nomeFinal) {
      return res.status(400).json({ error: 'name é obrigatório quando a etapa não vem do catálogo.' })
    }

    const { rows } = await query(
      `INSERT INTO project_stages (project_id, catalog_id, name, position, due_date, owner_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::stage_status, 'nao_iniciada'))
       RETURNING id`,
      [projectId, catalogIdFinal, nomeFinal, posicaoFinal, due_date || null, owner_id || null, status || null],
    )

    const { rows: completo } = await query(`${SELECT_ETAPAS} WHERE s.id = $1`, [rows[0].id])
    return res.status(201).json(completo[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /projects/:id/stages')
    return res.status(400).json({ error: err.message })
  }
})

// Atualiza nome, ordem, prazo, responsável e status da etapa.
router.put('/projects/:id/stages/:stageId', requireAuth, requireProjectManagement, async (req, res) => {
  const { id: projectId, stageId } = req.params
  const { name, position, due_date, owner_id, status } = req.body

  if (status !== undefined && !STATUS_VALIDOS.has(status)) {
    return res.status(400).json({ error: 'status inválido. Use nao_iniciada, em_andamento, entregue ou aprovada.' })
  }

  try {
    const { rows: atual } = await query(
      'SELECT id FROM project_stages WHERE id = $1 AND project_id = $2', [stageId, projectId])
    if (!atual[0]) {
      return res.status(404).json({ error: 'Etapa não encontrada.' })
    }

    const { rows } = await query(
      `UPDATE project_stages SET
         name     = COALESCE($1, name),
         position = COALESCE($2, position),
         due_date = CASE WHEN $3::boolean THEN $4::date ELSE due_date END,
         owner_id = CASE WHEN $5::boolean THEN $6::uuid ELSE owner_id END,
         status   = COALESCE($7::stage_status, status)
       WHERE id = $8
       RETURNING id`,
      [
        name?.trim() || null,
        Number.isInteger(position) ? position : null,
        due_date !== undefined, due_date || null,
        owner_id !== undefined, owner_id || null,
        status || null,
        stageId,
      ],
    )

    const { rows: completo } = await query(`${SELECT_ETAPAS} WHERE s.id = $1`, [rows[0].id])
    return res.json(completo[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /projects/:id/stages/:stageId')
    return res.status(400).json({ error: err.message })
  }
})

// Exclui etapa vazia. Nunca deixa o RESTRICT (migration 049) estourar cru:
// conta as tarefas antes e devolve mensagem legível.
router.delete('/projects/:id/stages/:stageId', requireAuth, requireProjectManagement, async (req, res) => {
  const { id: projectId, stageId } = req.params
  try {
    const { rows: atual } = await query(
      'SELECT id FROM project_stages WHERE id = $1 AND project_id = $2', [stageId, projectId])
    if (!atual[0]) {
      return res.status(404).json({ error: 'Etapa não encontrada.' })
    }

    const { rows: contagem } = await query(
      'SELECT COUNT(*)::int AS c FROM tasks WHERE stage_id = $1', [stageId])
    const n = contagem[0].c
    if (n > 0) {
      return res.status(400).json({ error: `Mova as ${n} tarefas desta etapa antes de excluí-la.` })
    }

    await query('DELETE FROM project_stages WHERE id = $1', [stageId])
    return res.status(200).json({ ok: true })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /projects/:id/stages/:stageId')
    return res.status(400).json({ error: err.message })
  }
})

// ─── Catálogo global de etapas ─────────────────────────────────────────
// Por padrão só as ativas: quem popula um seletor de etapas (criar etapa de
// projeto, template) não quer arquivada na lista. A tela de administração do
// catálogo (StageCatalogPage) é a exceção — ela precisa mostrar e reativar o
// que foi arquivado, daí o include_archived=1 opt-in em vez de mudar o
// default e quebrar todo mundo que já chama a rota sem parâmetro.
router.get('/stage-catalog', requireAuth, async (req, res) => {
  const incluirArquivadas = req.query.include_archived === '1'
  try {
    const { rows } = await query(
      `SELECT id, name, description, position, is_archived, created_at, updated_at
         FROM stage_catalog
        WHERE ($1::boolean OR NOT is_archived)
        ORDER BY position, name`, [incluirArquivadas])
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /stage-catalog')
    return res.status(400).json({ error: err.message })
  }
})

router.post('/stage-catalog', requireAuth, requireProjectManagement, async (req, res) => {
  const { name, description, position } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name é obrigatório.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO stage_catalog (name, description, position)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, position, is_archived, created_at, updated_at`,
      [name.trim(), description?.trim() || null, Number.isInteger(position) ? position : 0],
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /stage-catalog')
    return res.status(400).json({ error: err.message })
  }
})

router.put('/stage-catalog/:id', requireAuth, requireProjectManagement, async (req, res) => {
  const { name, description, position, is_archived } = req.body
  try {
    const { rows } = await query(
      `UPDATE stage_catalog SET
         name        = COALESCE($1, name),
         description = CASE WHEN $2::boolean THEN $3 ELSE description END,
         position    = COALESCE($4, position),
         is_archived = COALESCE($5, is_archived)
       WHERE id = $6
       RETURNING id, name, description, position, is_archived, created_at, updated_at`,
      [
        name?.trim() || null,
        description !== undefined, description?.trim() || null,
        Number.isInteger(position) ? position : null,
        typeof is_archived === 'boolean' ? is_archived : null,
        req.params.id,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Etapa do catálogo não encontrada.' })
    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /stage-catalog/:id')
    return res.status(400).json({ error: err.message })
  }
})

export default router
