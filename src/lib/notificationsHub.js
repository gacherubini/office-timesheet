import { query } from './db.js'

// ─── Hub SSE em memória ────────────────────────────────────────────────
// Map<userId, Set<res>> das conexões SSE abertas.
// Caveat: funciona por instância. Para múltiplas instâncias (Fly), trocar
// por Postgres LISTEN/NOTIFY. Hoje é instância única.
const clients = new Map()

export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set())
  clients.get(userId).add(res)
}

export function removeClient(userId, res) {
  const set = clients.get(userId)
  if (!set) return
  set.delete(res)
  if (set.size === 0) clients.delete(userId)
}

function publish(userId, payload) {
  const set = clients.get(userId)
  if (!set) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of set) {
    try {
      res.write(data)
    } catch {
      // conexão morta: limpa
      removeClient(userId, res)
    }
  }
}

// Retorna a notificação enriquecida (com nomes) para render/SSE.
async function fetchNotification(id) {
  const { rows } = await query(
    `SELECT n.id, n.user_id, n.type, n.task_id, n.comment_id, n.actor_id,
            n.read_at, n.created_at,
            t.title AS task_title,
            a.name AS actor_name, a.avatar_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN tasks t ON t.id = n.task_id
     LEFT JOIN users a ON a.id = n.actor_id
     WHERE n.id = $1`,
    [id]
  )
  return rows[0] || null
}

// Cria a notificação e empurra via SSE. Não notifica o próprio ator.
export async function createNotification({ userId, type, taskId, commentId = null, actorId }) {
  if (!userId || userId === actorId) return null
  const { rows } = await query(
    `INSERT INTO notifications (user_id, type, task_id, comment_id, actor_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, type, taskId || null, commentId, actorId || null]
  )
  const enriched = await fetchNotification(rows[0].id)
  if (enriched) publish(userId, enriched)
  return enriched
}
