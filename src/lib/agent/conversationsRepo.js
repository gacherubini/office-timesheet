// Persistência de conversas do agente. Hard delete, retenção 30 dias, criação
// preguiçosa no primeiro insertTurn de bloco fechado. Sem dual-write com Map.
import { query, withTransaction } from '../db.js'
import { logConversationCreated, logConversationPurged } from './audit.js'

export const MAX_TURNS = 10
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}

// Trunca por BLOCOS DE TURNO, nunca por contagem bruta. Um bloco começa num
// role:'user' e vai até o próximo user. Cortar só na fronteira garante janela
// que começa em 'user' e pares tool_calls↔tool íntegros.
function truncarPorTurnos(messages, maxTurns = MAX_TURNS) {
  const inicios = []
  messages.forEach((m, i) => { if (m.role === 'user') inicios.push(i) })
  if (inicios.length <= maxTurns) return messages
  return messages.slice(inicios[inicios.length - maxTurns])
}

function tituloDe(rows) {
  const user = (rows || []).find((r) => r.role === 'user')
  const raw = user?.ui?.texto_visivel ?? user?.content ?? ''
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 60)
}

export async function create({ id, userId, role, title, now = Date.now() }) {
  const { rows } = await query(
    `INSERT INTO agent_conversations (id, user_id, role, title, last_message_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, role, title, last_message_at, created_at, updated_at`,
    [id, userId, role, title, new Date(now)],
  )
  return rows[0]
}

export async function getForOwner(id, userId, role) {
  if (!isUuid(id)) return null
  const { rows } = await query(
    `SELECT id, user_id, role, title, last_message_at, created_at, updated_at
       FROM agent_conversations
      WHERE id = $1 AND user_id = $2 AND role = $3`,
    [id, userId, role],
  )
  return rows[0] || null
}

export async function listForOwner(userId, role, now = Date.now()) {
  await purgeExpiredConversations(now)
  const { rows } = await query(
    `SELECT id, title, last_message_at, created_at
       FROM agent_conversations
      WHERE user_id = $1 AND role = $2
      ORDER BY last_message_at DESC`,
    [userId, role],
  )
  return rows
}

export async function rename(id, userId, title) {
  if (!isUuid(id)) return null
  const { rows } = await query(
    `UPDATE agent_conversations SET title = $3 WHERE id = $1 AND user_id = $2
     RETURNING id, title, last_message_at, created_at, updated_at`,
    [id, userId, title],
  )
  return rows[0] || null
}

export async function remove(id, userId) {
  if (!isUuid(id)) return false
  const { rowCount } = await query(
    `DELETE FROM agent_conversations WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  return rowCount > 0
}

export async function purgeExpiredConversations(now = Date.now()) {
  const { rowCount } = await query(
    `DELETE FROM agent_conversations WHERE last_message_at < $1`,
    [new Date(now - RETENTION_MS)],
  )
  if (rowCount > 0) logConversationPurged({ count: rowCount })
  return rowCount
}

export async function loadMessagesWithUi(conversationId) {
  if (!isUuid(conversationId)) return []
  const { rows } = await query(
    `SELECT id, role, content, tool_calls, tool_call_id, ui
       FROM agent_messages
      WHERE conversation_id = $1
      ORDER BY seq ASC`,
    [conversationId],
  )
  return rows
}

export async function loadMessagesForModel(conversationId) {
  if (!isUuid(conversationId)) return []
  const { rows } = await query(
    `SELECT role, content, tool_calls, tool_call_id
       FROM agent_messages
      WHERE conversation_id = $1
      ORDER BY seq ASC`,
    [conversationId],
  )
  const all = rows.map((r) => {
    const m = { role: r.role, content: r.content }
    if (r.tool_calls) m.tool_calls = r.tool_calls
    if (r.tool_call_id) m.tool_call_id = r.tool_call_id
    return m
  })
  return truncarPorTurnos(all)
}

export async function insertTurn(id, profile, rows, now = Date.now()) {
  await purgeExpiredConversations(now)
  if (!rows?.length) return []
  const at = new Date(now)
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM agent_conversations WHERE id = $1 AND user_id = $2 AND role = $3`,
      [id, profile.id, profile.role],
    )
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO agent_conversations (id, user_id, role, title, last_message_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, profile.id, profile.role, tituloDe(rows), at],
      )
      logConversationCreated({ profile, conversationId: id })
    }
    const { rows: seqRows } = await client.query(
      `SELECT COALESCE(MAX(seq), 0)::int AS max FROM agent_messages WHERE conversation_id = $1`,
      [id],
    )
    let seq = seqRows[0].max
    // Devolve os ids gravados: a avaliação da resposta precisa apontar para uma
    // mensagem concreta, e o cliente só descobre qual depois que ela existe.
    const gravadas = []
    for (const r of rows) {
      seq += 1
      const { rows: out } = await client.query(
        `INSERT INTO agent_messages (conversation_id, seq, role, content, tool_calls, tool_call_id, ui)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
         RETURNING id, role, seq`,
        [
          id, seq, r.role, r.content ?? null,
          r.tool_calls != null ? JSON.stringify(r.tool_calls) : null,
          r.tool_call_id ?? null,
          r.ui != null ? JSON.stringify(r.ui) : null,
        ],
      )
      gravadas.push(out[0])
    }
    await client.query(
      `UPDATE agent_conversations SET last_message_at = $2 WHERE id = $1`,
      [id, at],
    )
    return gravadas
  })
}
