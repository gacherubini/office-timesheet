import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { isAdmin } from '../lib/permissions.js'
import { query } from '../lib/db.js'
import { createNotification } from '../lib/notificationsHub.js'
import { logActivity } from '../lib/taskActivity.js'

const router = Router()

// ─── Helpers de permissão (dependem do banco) ──────────────────────────
async function isProjectLeader(userId, projectId) {
  const { rows } = await query(
    'SELECT 1 FROM project_leaders WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  )
  return rows.length > 0
}

async function canManageTasks(profile, projectId) {
  if (isAdmin(profile)) return true
  return isProjectLeader(profile.id, projectId)
}

// ─── LÍDERES ───────────────────────────────────────────────────────────
// Lista líderes de um projeto (qualquer usuário logado)
router.get('/projects/:id/leaders', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.position
       FROM project_leaders pl
       JOIN users u ON u.id = pl.user_id
       WHERE pl.project_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.name`,
      [req.params.id]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Projetos onde o usuário logado é líder (1 request no lugar de N no board)
router.get('/me/leadership', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT project_id FROM project_leaders WHERE user_id = $1',
      [req.profile.id]
    )
    return res.json(rows.map((r) => r.project_id))
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Vincula um líder (admin)
router.post('/projects/:id/leaders', requireAuth, requireAdmin, async (req, res) => {
  const { user_id } = req.body
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório.' })
  try {
    await query(
      `INSERT INTO project_leaders (project_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [req.params.id, user_id]
    )
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.position
       FROM users u WHERE u.id = $1`,
      [user_id]
    )
    return res.status(201).json(rows[0] || null)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Desvincula um líder (admin)
router.delete('/projects/:id/leaders/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM project_leaders WHERE project_id = $1 AND user_id = $2 RETURNING user_id',
      [req.params.id, req.params.userId]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vínculo não encontrado.' })
    }
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── TAREFAS ───────────────────────────────────────────────────────────
// Cria tarefa num projeto (admin ou líder do projeto)
router.post('/projects/:id/tasks', requireAuth, async (req, res) => {
  const projectId = req.params.id
  const { title, description, assignee_id, due_date } = req.body

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title é obrigatório.' })
  }

  try {
    if (!(await canManageTasks(req.profile, projectId))) {
      return res.status(403).json({ error: 'Apenas admin ou líder do projeto pode criar tarefas.' })
    }

    // position = vai para o fim da coluna 'todo'
    const { rows: posRows } = await query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks
       WHERE project_id = $1 AND status = 'todo'`,
      [projectId]
    )
    const position = posRows[0].next

    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, description, assignee_id, due_date, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, project_id, title, description, status, assignee_id, due_date, position, created_by, completed_at, created_at, updated_at`,
      [
        projectId,
        title.trim(),
        description?.trim() || null,
        assignee_id || null,
        due_date || null,
        position,
        req.profile.id,
      ]
    )
    const task = rows[0]

    await logActivity(task.id, req.profile.id, 'created', { title: task.title })

    // Notifica o responsável, se houver e não for quem criou
    if (task.assignee_id) {
      await createNotification({
        userId: task.assignee_id,
        type: 'task_assigned',
        taskId: task.id,
        actorId: req.profile.id,
      })
    }

    return res.status(201).json(task)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Lista tarefas para o board (todos os usuários logados).
// Filtros opcionais: project_id, status, assignee_id.
router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const conditions = []
    const params = []
    if (req.query.project_id) {
      params.push(req.query.project_id)
      conditions.push(`t.project_id = $${params.length}`)
    }
    if (req.query.status) {
      params.push(req.query.status)
      conditions.push(`t.status = $${params.length}`)
    }
    if (req.query.assignee_id) {
      params.push(req.query.assignee_id)
      conditions.push(`t.assignee_id = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await query(
      `SELECT t.id, t.project_id, t.title, t.description, t.status, t.assignee_id,
              t.due_date, t.position, t.priority, t.created_by, t.completed_at, t.created_at, t.updated_at,
              p.name AS project_name,
              a.name AS assignee_name, a.avatar_url AS assignee_avatar_url,
              COALESCE(tl.total_minutes, 0) AS total_minutes,
              COALESCE(cc.comment_count, 0) AS comment_count,
              COALESCE(ac.attachment_count, 0) AS attachment_count
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           COALESCE(ttl.duration_minutes,
             EXTRACT(EPOCH FROM (now() - ttl.started_at)) / 60)
         ), 0)::int AS total_minutes
         FROM task_time_logs ttl
         WHERE ttl.task_id = t.id
       ) tl ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS comment_count FROM task_comments c WHERE c.task_id = t.id
       ) cc ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS attachment_count FROM task_attachments at WHERE at.task_id = t.id
       ) ac ON true
       ${where}
       ORDER BY t.status, t.position, t.created_at`,
      params
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Detalhe de uma tarefa (qualquer usuário logado).
// Usado pelo deep-link /project-board?task=:id quando a tarefa
// não está na lista atual (ex: filtrada por outro projeto).
router.get('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.project_id, t.title, t.description, t.status, t.assignee_id,
              t.due_date, t.position, t.priority, t.created_by, t.completed_at, t.created_at, t.updated_at,
              p.name AS project_name,
              a.name AS assignee_name, a.avatar_url AS assignee_avatar_url,
              COALESCE(tl.total_minutes, 0) AS total_minutes,
              COALESCE(cc.comment_count, 0) AS comment_count,
              COALESCE(ac.attachment_count, 0) AS attachment_count
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           COALESCE(ttl.duration_minutes,
             EXTRACT(EPOCH FROM (now() - ttl.started_at)) / 60)
         ), 0)::int AS total_minutes
         FROM task_time_logs ttl
         WHERE ttl.task_id = t.id
       ) tl ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS comment_count FROM task_comments c WHERE c.task_id = t.id
       ) cc ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS attachment_count FROM task_attachments at WHERE at.task_id = t.id
       ) ac ON true
       WHERE t.id = $1`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Edição completa de tarefa (admin ou líder do projeto)
router.put('/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title, description, assignee_id, due_date, priority } = req.body
  const VALID_PRIORITY = ['low', 'medium', 'high']
  try {
    const { rows: taskRows } = await query(
      'SELECT project_id, title, assignee_id, priority FROM tasks WHERE id = $1',
      [id]
    )
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    const before = taskRows[0]

    if (!(await canManageTasks(req.profile, before.project_id))) {
      return res.status(403).json({ error: 'Apenas admin ou líder do projeto pode editar a tarefa.' })
    }

    const updates = []
    const params = []
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'title não pode ser vazio.' })
      params.push(title.trim()); updates.push(`title = $${params.length}`)
    }
    if (description !== undefined) {
      params.push(description?.trim() || null); updates.push(`description = $${params.length}`)
    }
    if (assignee_id !== undefined) {
      params.push(assignee_id || null); updates.push(`assignee_id = $${params.length}`)
    }
    if (due_date !== undefined) {
      params.push(due_date || null); updates.push(`due_date = $${params.length}`)
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITY.includes(priority)) {
        return res.status(400).json({ error: 'priority inválida. Use low, medium ou high.' })
      }
      params.push(priority); updates.push(`priority = $${params.length}::task_priority`)
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' })

    params.push(id)
    const { rows } = await query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, project_id, title, description, status, assignee_id, due_date, position, priority, completed_at, created_at, updated_at`,
      params
    )
    const after = rows[0]

    // Histórico de atividade
    if (title !== undefined && title.trim() !== before.title) {
      await logActivity(id, req.profile.id, 'title_changed', { from: before.title, to: after.title })
    }
    if (priority !== undefined && priority !== before.priority) {
      await logActivity(id, req.profile.id, 'priority_changed', { from: before.priority, to: after.priority })
    }
    if (assignee_id !== undefined && (after.assignee_id || null) !== (before.assignee_id || null)) {
      await logActivity(id, req.profile.id, 'assignee_changed', { to: after.assignee_id })
      // Notifica o novo responsável
      if (after.assignee_id) {
        await createNotification({
          userId: after.assignee_id,
          type: 'task_assigned',
          taskId: id,
          actorId: req.profile.id,
        })
      }
    }

    return res.json(after)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Move a tarefa de coluna/posição. Permitido a admin, líder do projeto
// OU ao responsável da própria tarefa.
router.put('/tasks/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status, position } = req.body
  const VALID = ['todo', 'in_progress', 'done', 'abandoned']
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: 'status inválido. Use todo, in_progress, done ou abandoned.' })
  }
  try {
    const { rows: taskRows } = await query(
      'SELECT project_id, assignee_id, status FROM tasks WHERE id = $1',
      [id]
    )
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    const task = taskRows[0]

    const isAssignee = task.assignee_id && task.assignee_id === req.profile.id
    if (!isAssignee && !(await canManageTasks(req.profile, task.project_id))) {
      return res.status(403).json({ error: 'Sem permissão para mover esta tarefa.' })
    }

    const newPosition = Number.isInteger(position) ? position : 0
    const { rows } = await query(
      `UPDATE tasks
       SET status = $1::task_status,
           position = $2,
           completed_at = CASE WHEN $1::task_status = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END
       WHERE id = $3
       RETURNING id, project_id, title, description, status, assignee_id, due_date, position, priority, completed_at, created_at, updated_at`,
      [status, newPosition, id]
    )

    if (status !== task.status) {
      await logActivity(id, req.profile.id, 'status_changed', { from: task.status, to: status })
    }

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Exclui tarefa (admin ou líder do projeto)
router.delete('/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const { rows: taskRows } = await query('SELECT project_id FROM tasks WHERE id = $1', [id])
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })

    if (!(await canManageTasks(req.profile, taskRows[0].project_id))) {
      return res.status(403).json({ error: 'Apenas admin ou líder do projeto pode excluir a tarefa.' })
    }
    await query('DELETE FROM tasks WHERE id = $1', [id])
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── TEMPO POR TAREFA (cronômetro) ─────────────────────────────────────
// Inicia uma sessão de tempo na tarefa para o usuário logado.
router.post('/tasks/:id/time/start', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const { rows: taskRows } = await query('SELECT id FROM tasks WHERE id = $1', [id])
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })

    const { rows } = await query(
      `INSERT INTO task_time_logs (task_id, user_id, started_at)
       VALUES ($1, $2, now())
       RETURNING id, task_id, user_id, started_at, ended_at, duration_minutes`,
      [id, req.profile.id]
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma sessão aberta nesta tarefa.' })
    }
    return res.status(400).json({ error: err.message })
  }
})

// Encerra a sessão aberta do usuário logado nesta tarefa.
router.post('/tasks/:id/time/stop', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const { rows } = await query(
      `UPDATE task_time_logs
       SET ended_at = now(),
           duration_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60))::int
       WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL
       RETURNING id, task_id, user_id, started_at, ended_at, duration_minutes`,
      [id, req.profile.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Nenhuma sessão aberta para encerrar.' })
    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Resumo de tempo da tarefa: total geral, por pessoa, e sessão aberta do usuário logado.
router.get('/tasks/:id/time', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const { rows: perUser } = await query(
      `SELECT ttl.user_id, u.name AS user_name, u.avatar_url AS user_avatar_url,
              COALESCE(SUM(
                COALESCE(ttl.duration_minutes,
                  EXTRACT(EPOCH FROM (now() - ttl.started_at)) / 60)
              ), 0)::int AS minutes
       FROM task_time_logs ttl
       JOIN users u ON u.id = ttl.user_id
       WHERE ttl.task_id = $1
       GROUP BY ttl.user_id, u.name, u.avatar_url
       ORDER BY minutes DESC`,
      [id]
    )
    const { rows: openRows } = await query(
      `SELECT id, started_at FROM task_time_logs
       WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL
       LIMIT 1`,
      [id, req.profile.id]
    )
    const total = perUser.reduce((sum, r) => sum + r.minutes, 0)
    return res.json({
      total_minutes: total,
      per_user: perUser,
      open_session: openRows[0] || null,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
export { isProjectLeader, canManageTasks }
