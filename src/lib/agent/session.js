// Sessão de conversa server-side, em memória e efêmera (§11). Mesmo caveat do
// notificationsHub: funciona por instância; hoje é instância única.
import { randomUUID } from 'node:crypto'

export const MAX_TURNS = 10
export const SESSION_TTL_MS = 30 * 60 * 1000

const sessions = new Map() // id → { userId, role, updatedAt, messages }

export function loadSession(conversationId, profile, now = Date.now()) {
  const s = conversationId ? sessions.get(conversationId) : null
  const vivo = s && now - s.updatedAt <= SESSION_TTL_MS && s.userId === profile.id && s.role === profile.role
  if (vivo) return { id: conversationId, messages: [...s.messages] }
  // Sem sessão válida: abre nova, carimbando dono e papel.
  const id = randomUUID()
  sessions.set(id, { userId: profile.id, role: profile.role, updatedAt: now, messages: [] })
  return { id, messages: [] }
}

export function saveTurn(id, profile, novasMensagens, now = Date.now()) {
  const s = sessions.get(id)
  if (!s || s.userId !== profile.id || s.role !== profile.role) return
  s.messages.push(...novasMensagens)
  if (s.messages.length > MAX_TURNS * 2) s.messages = s.messages.slice(-MAX_TURNS * 2)
  s.updatedAt = now
}
