// Sessão de conversa server-side, em memória e efêmera (§11). Mesmo caveat do
// notificationsHub: funciona por instância; hoje é instância única.
import { randomUUID } from 'node:crypto'

export const MAX_TURNS = 10
export const SESSION_TTL_MS = 30 * 60 * 1000

const sessions = new Map() // id → { userId, role, updatedAt, messages }

// Expurgo preguiçoso (§11): num box always-on o Map cresceria sem teto, porque o
// TTL só era LIDO no load — sessão inativa nunca saía. Varre e apaga as vencidas
// a cada escrita. Sem setInterval (complica teste/shutdown); o `now` é injetável
// para o teste ser determinístico.
function expurgarSessoesVencidas(now) {
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id)
  }
}

// Trunca por BLOCOS DE TURNO, nunca por contagem bruta. Um bloco começa num
// role:'user' e vai até o próximo user (inclui o assistant+tool_calls e as
// respostas 'tool' daquele turno). Cortar por contagem poderia deixar a janela
// começar com um 'tool' órfão, ou reter um assistant.tool_calls sem as respostas
// — histórico malformado que o provedor recusa (400) no turno seguinte. Ao cortar
// só na fronteira de um bloco, a janela SEMPRE começa num 'user' e todo par
// tool_calls↔tool retido fica íntegro. Mantém os últimos MAX_TURNS blocos.
function truncarPorTurnos(messages, maxTurns = MAX_TURNS) {
  const inicios = []
  messages.forEach((m, i) => { if (m.role === 'user') inicios.push(i) })
  if (inicios.length <= maxTurns) return messages
  return messages.slice(inicios[inicios.length - maxTurns])
}

export function loadSession(conversationId, profile, now = Date.now()) {
  expurgarSessoesVencidas(now)
  const s = conversationId ? sessions.get(conversationId) : null
  const vivo = s && now - s.updatedAt <= SESSION_TTL_MS && s.userId === profile.id && s.role === profile.role
  if (vivo) return { id: conversationId, messages: [...s.messages] }
  // Sem sessão válida: abre nova, carimbando dono e papel.
  const id = randomUUID()
  sessions.set(id, { userId: profile.id, role: profile.role, updatedAt: now, messages: [] })
  return { id, messages: [] }
}

export function saveTurn(id, profile, novasMensagens, now = Date.now()) {
  expurgarSessoesVencidas(now)
  const s = sessions.get(id)
  if (!s || s.userId !== profile.id || s.role !== profile.role) return
  s.messages.push(...novasMensagens)
  s.messages = truncarPorTurnos(s.messages)
  s.updatedAt = now
}

// Bloco sujo (tool_calls sem role:tool, ou leitura sem answer) não entra na
// sessão — senão o próximo turno reenvia histórico órfão e o provedor recusa.
export function turnoPersistivel(novos = []) {
  const calls = novos.flatMap((m) => (m.role === 'assistant' && m.tool_calls) ? m.tool_calls : [])
  const fechado = calls.every((c) => novos.some((m) => m.role === 'tool' && m.tool_call_id === c.id))
  const temAnswer = novos.some((m) => m.role === 'assistant' && m.content)
  const temProposta = novos.some((m) => m.role === 'tool' && /proposta_emitida/.test(m.content || ''))
  return fechado && (temAnswer || temProposta)
}

// Observabilidade/teste: quantas sessões há em memória agora (§11).
export function sessionCount() {
  return sessions.size
}

// Anexa à sessão uma nota TEXTUAL de execução (§1). Depois que o execute roda a
// escrita DE VERDADE, isto registra o resultado no histórico para o próximo
// turno o modelo saber que a ação foi feita (§10: nunca antes). É só conteúdo
// assistant — NUNCA cria tool_calls órfãos, senão o histórico quebraria. No-op
// gracioso se a sessão sumiu (expirou, trocou de dono/papel).
export function appendExecutionNote(conversationId, profile, texto, now = Date.now()) {
  const s = conversationId ? sessions.get(conversationId) : null
  if (!s || s.userId !== profile.id || s.role !== profile.role) return
  s.messages.push({ role: 'assistant', content: texto })
  s.messages = truncarPorTurnos(s.messages)
  s.updatedAt = now
}
