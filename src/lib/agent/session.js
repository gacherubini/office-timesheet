// Fachada da sessão do agente. O Map efêmero saiu: load/save falam com
// Postgres (conversationsRepo). loop.js continua recebendo só messages.
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { logConversationResumed } from './audit.js'
import {
  MAX_TURNS,
  RETENTION_MS,
  getForOwner,
  insertTurn,
  loadMessagesForModel,
} from './conversationsRepo.js'

export { MAX_TURNS, RETENTION_MS, insertTurn }

// Bloco sujo (tool_calls sem role:tool, ou leitura sem answer) não entra na
// sessão — senão o próximo turno reenvia histórico órfão e o provedor recusa.
export function turnoPersistivel(novos = []) {
  const calls = novos.flatMap((m) => (m.role === 'assistant' && m.tool_calls) ? m.tool_calls : [])
  const fechado = calls.every((c) => novos.some((m) => m.role === 'tool' && m.tool_call_id === c.id))
  const temAnswer = novos.some((m) => m.role === 'assistant' && m.content)
  const temProposta = novos.some((m) => m.role === 'tool' && /proposta_emitida/.test(m.content || ''))
  return fechado && (temAnswer || temProposta)
}

// Miss nunca INSERT: id é sempre UUID novo do servidor. Hit só se a linha
// existe e user_id + role batem. Papel diferente = miss (transcript intacto).
export async function loadSession(conversationId, profile, _now = Date.now()) {
  const hit = conversationId
    ? await getForOwner(conversationId, profile.id, profile.role)
    : null
  if (hit) {
    logConversationResumed({ profile, conversationId: hit.id })
    return { id: hit.id, messages: await loadMessagesForModel(hit.id), persistido: true }
  }
  return { id: randomUUID(), messages: [], persistido: false }
}

// Wrapper de teste: monta rows OpenAI (ui: null) e chama insertTurn.
export async function saveTurn(id, profile, novasMensagens, now = Date.now()) {
  const rows = (novasMensagens || []).map((m) => ({
    role: m.role,
    content: m.content ?? null,
    tool_calls: m.tool_calls ?? null,
    tool_call_id: m.tool_call_id ?? null,
    ui: null,
  }))
  return insertTurn(id, profile, rows, now)
}

export async function sessionCount() {
  const { rows } = await query('SELECT COUNT(*)::int AS c FROM agent_conversations')
  return rows[0].c
}

// Anexa uma nota TEXTUAL de execução. No-op se a conversa não existe ou
// não é do par (user, role) — nunca cria linha fantasma.
// A nota é para o MODELO saber, no próximo turno, o que foi feito. A marca
// `nota_execucao` no ui existe para a tela NÃO repetir isso como bolha: quem
// está olhando já vê o desfecho no card da proposta.
export async function appendExecutionNote(conversationId, profile, texto, now = Date.now()) {
  if (!conversationId) return
  const hit = await getForOwner(conversationId, profile.id, profile.role)
  if (!hit) return
  return insertTurn(conversationId, profile, [{
    role: 'assistant', content: texto, tool_calls: null, tool_call_id: null,
    ui: { nota_execucao: true },
  }], now)
}

// Carimba o desfecho na proposta já persistida, para ela não voltar do banco
// como "expirada" depois de ter sido executada ou recusada. No-op silencioso
// se a linha não existe: o desfecho é enfeite de tela, nunca pode derrubar uma
// escrita que já aconteceu no banco.
export async function marcarDesfechoDaProposta(conversationId, profile, proposalId, desfecho) {
  if (!conversationId || !proposalId) return
  const hit = await getForOwner(conversationId, profile.id, profile.role)
  if (!hit) return
  await query(
    `UPDATE agent_messages
        SET ui = jsonb_set(ui, '{proposta,desfecho}', to_jsonb($3::text))
      WHERE conversation_id = $1
        AND ui -> 'proposta' ->> 'proposalId' = $2`,
    [conversationId, proposalId, desfecho],
  )
}
