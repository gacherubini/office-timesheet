import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { isAdmin } from '../lib/permissions.js'
import { query } from '../lib/db.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { canManageTasks, isProjectLeader } from './projectManagement.js'
import { createNotification } from '../lib/notificationsHub.js'
import { logActivity } from '../lib/taskActivity.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

const router = Router()

const PALETTE = ['blue', 'green', 'amber', 'rose', 'violet', 'slate']

// ─── COMENTÁRIOS ───────────────────────────────────────────────────────
router.get('/tasks/:id/comments', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.body, c.created_at, c.author_id,
              u.name AS author_name, u.avatar_url AS author_avatar_url,
              COALESCE(
                (SELECT array_agg(m.user_id) FROM task_comment_mentions m WHERE m.comment_id = c.id),
                '{}'
              ) AS mentioned_user_ids
       FROM task_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/tasks/:id/comments', requireAuth, async (req, res) => {
  const taskId = req.params.id
  const { body, mentioned_user_ids } = req.body
  if (!body || !body.trim()) return res.status(400).json({ error: 'body é obrigatório.' })

  try {
    const { rows: taskRows } = await query(
      'SELECT id, assignee_id FROM tasks WHERE id = $1',
      [taskId]
    )
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    const task = taskRows[0]

    const { rows } = await query(
      `INSERT INTO task_comments (task_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, task_id, author_id, body, created_at`,
      [taskId, req.profile.id, body.trim()]
    )
    const comment = rows[0]

    // Menções (dedupe + sem o próprio autor)
    const mentioned = [...new Set(
      Array.isArray(mentioned_user_ids) ? mentioned_user_ids.filter(Boolean) : []
    )].filter((uid) => uid !== req.profile.id)

    for (const uid of mentioned) {
      await query(
        `INSERT INTO task_comment_mentions (comment_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [comment.id, uid]
      )
    }

    await logActivity(taskId, req.profile.id, 'comment_added', null)

    // Notificações de menção
    const mentionedSet = new Set(mentioned)
    for (const uid of mentioned) {
      await createNotification({
        userId: uid,
        type: 'mention',
        taskId,
        commentId: comment.id,
        actorId: req.profile.id,
      })
    }

    // Notificação de comentário pro responsável (se não for autor nem já mencionado)
    if (task.assignee_id && task.assignee_id !== req.profile.id && !mentionedSet.has(task.assignee_id)) {
      await createNotification({
        userId: task.assignee_id,
        type: 'task_comment',
        taskId,
        commentId: comment.id,
        actorId: req.profile.id,
      })
    }

    return res.status(201).json({ ...comment, mentioned_user_ids: mentioned })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/tasks/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT author_id FROM task_comments WHERE id = $1 AND task_id = $2',
      [req.params.commentId, req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Comentário não encontrado.' })
    if (rows[0].author_id !== req.profile.id && !isAdmin(req.profile)) {
      return res.status(403).json({ error: 'Apenas o autor ou admin pode excluir.' })
    }
    await query('DELETE FROM task_comments WHERE id = $1', [req.params.commentId])
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ANEXOS ────────────────────────────────────────────────────────────
router.get('/tasks/:id/attachments', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.file_url, a.file_name, a.file_size, a.mime_type, a.created_at,
              a.uploaded_by, u.name AS uploaded_by_name
       FROM task_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.task_id = $1
       ORDER BY a.created_at DESC`,
      [req.params.id]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Qualquer colaborador pode anexar
router.post('/tasks/:id/attachments', requireAuth, upload.single('file'), async (req, res) => {
  const taskId = req.params.id
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const { rows: taskRows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })

    const { url } = await uploadFile('tasks', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    const { rows } = await query(
      `INSERT INTO task_attachments (task_id, uploaded_by, file_url, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_url, file_name, file_size, mime_type, created_at, uploaded_by`,
      [taskId, req.profile.id, url, req.file.originalname, req.file.size, req.file.mimetype]
    )

    await logActivity(taskId, req.profile.id, 'attachment_added', { file_name: req.file.originalname })

    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/tasks/:id/attachments/:attId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.file_url, a.uploaded_by, t.project_id
       FROM task_attachments a JOIN tasks t ON t.id = a.task_id
       WHERE a.id = $1 AND a.task_id = $2`,
      [req.params.attId, req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Anexo não encontrado.' })
    const att = rows[0]

    const allowed =
      att.uploaded_by === req.profile.id ||
      isAdmin(req.profile) ||
      (await isProjectLeader(req.profile.id, att.project_id))
    if (!allowed) return res.status(403).json({ error: 'Sem permissão para excluir o anexo.' })

    const key = extractKeyFromUrl(att.file_url)
    if (key) await deleteFile(key)
    await query('DELETE FROM task_attachments WHERE id = $1', [req.params.attId])
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── ETIQUETAS ─────────────────────────────────────────────────────────
router.post('/tasks/:id/labels', requireAuth, async (req, res) => {
  const taskId = req.params.id
  const { text, color } = req.body
  if (!text || !text.trim()) return res.status(400).json({ error: 'text é obrigatório.' })
  const safeColor = PALETTE.includes(color) ? color : 'slate'
  try {
    const { rows: taskRows } = await query('SELECT project_id FROM tasks WHERE id = $1', [taskId])
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    if (!(await canManageTasks(req.profile, taskRows[0].project_id))) {
      return res.status(403).json({ error: 'Apenas admin ou líder do projeto pode etiquetar.' })
    }
    const { rows } = await query(
      `INSERT INTO task_labels (task_id, text, color)
       VALUES ($1, $2, $3)
       RETURNING id, task_id, text, color, created_at`,
      [taskId, text.trim(), safeColor]
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/tasks/:id/labels/:labelId', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.id, t.project_id FROM task_labels l JOIN tasks t ON t.id = l.task_id
       WHERE l.id = $1 AND l.task_id = $2`,
      [req.params.labelId, req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Etiqueta não encontrada.' })
    if (!(await canManageTasks(req.profile, rows[0].project_id))) {
      return res.status(403).json({ error: 'Apenas admin ou líder do projeto pode remover etiqueta.' })
    }
    await query('DELETE FROM task_labels WHERE id = $1', [req.params.labelId])
    return res.status(204).send()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── HISTÓRICO DE ATIVIDADE (só criador da tarefa ou admin) ────────────
router.get('/tasks/:id/activity', requireAuth, async (req, res) => {
  try {
    const { rows: taskRows } = await query('SELECT created_by FROM tasks WHERE id = $1', [req.params.id])
    if (taskRows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' })
    if (taskRows[0].created_by !== req.profile.id && !isAdmin(req.profile)) {
      return res.status(403).json({ error: 'Histórico restrito ao criador da tarefa.' })
    }
    const { rows } = await query(
      `SELECT ac.id, ac.type, ac.detail, ac.created_at, ac.actor_id,
              u.name AS actor_name, u.avatar_url AS actor_avatar_url
       FROM task_activity ac
       LEFT JOIN users u ON u.id = ac.actor_id
       WHERE ac.task_id = $1
       ORDER BY ac.created_at DESC`,
      [req.params.id]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
