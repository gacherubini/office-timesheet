import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { query } from '../lib/db.js'
import { addClient, removeClient } from '../lib/notificationsHub.js'

const router = Router()

// Lista notificações do usuário (mais recentes primeiro)
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.id, n.type, n.task_id, n.comment_id, n.project_id, n.actor_id, n.read_at, n.created_at,
              t.title AS task_title,
              p.name AS project_name,
              a.name AS actor_name, a.avatar_url AS actor_avatar_url
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN projects p ON p.id = n.project_id
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.profile.id]
    )
    return res.json(rows)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [req.profile.id]
    )
    return res.json({ count: rows[0].count })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.put('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at`,
      [req.params.id, req.profile.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Notificação não encontrada.' })
    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [req.profile.id]
    )
    return res.json({ ok: true })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── SSE stream ────────────────────────────────────────────────────────
// EventSource não envia header Authorization, então o token vem por query.
// Recarrega o usuário do DB (is_active/deleted_at/sessions_valid_after) —
// JWT sozinho deixava demitido/inativo recebendo por até 7 dias.
router.get('/notifications/stream', async (req, res) => {
  const token = req.query.token
  if (!token) return res.status(401).json({ error: 'Token ausente.' })

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    return res.status(401).json({ error: 'Token inválido.' })
  }

  let userId
  try {
    const { rows } = await query(
      `SELECT id, is_active, deleted_at, sessions_valid_after
         FROM users WHERE id = $1`,
      [payload.sub],
    )
    const user = rows[0]
    if (!user || user.deleted_at || !user.is_active) {
      return res.status(403).json({ error: 'Usuário inativo ou removido.' })
    }
    if (user.sessions_valid_after && payload.iat) {
      const validAfterMs = new Date(user.sessions_valid_after).getTime()
      if (Number.isFinite(validAfterMs) && validAfterMs > 0 && payload.iat * 1000 <= validAfterMs) {
        return res.status(401).json({ error: 'Sessão invalidada. Faça login novamente.' })
      }
    }
    userId = user.id
  } catch {
    return res.status(500).json({ error: 'Erro ao validar sessão.' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 5000\n\n')
  res.write(': connected\n\n')

  addClient(userId, res)

  // Heartbeat a cada 25s pra não cair em timeout de proxy.
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(heartbeat)
      removeClient(userId, res)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeClient(userId, res)
  })
})

export default router
