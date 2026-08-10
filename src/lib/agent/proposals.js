// Propostas de escrita pendentes, em memória, uso único, TTL curto (§16).
// O cliente recebe só o proposal_id; o payload nunca sai do servidor.
import { randomUUID } from 'node:crypto'

export const PROPOSAL_TTL_MS = 5 * 60 * 1000

const pending = new Map() // id → { userId, role, kind, payload, conversationId, descricao, criadoEm }

// Expurgo preguiçoso (§16): uma proposta proposta-e-nunca-aprovada só saía do Map
// quando consumida, então num box always-on as pendências vencidas ficavam para
// sempre. Varre e apaga as vencidas a cada criação. Sem setInterval; o `now` é
// injetável para o teste ser determinístico.
function expurgarPropostasVencidas(now) {
  for (const [id, p] of pending) {
    if (now - p.criadoEm > PROPOSAL_TTL_MS) pending.delete(id)
  }
}

// conversationId e descricao são guardados para o execute realimentar a sessão
// dona (§1): após a execução real, uma nota textual volta ao histórico com o
// que a proposta descrevia. Ambos opcionais — proposta sem sessão vira no-op.
export function createProposal({ profile, kind, payload, conversationId = null, descricao = null, now = Date.now() }) {
  expurgarPropostasVencidas(now)
  const proposalId = randomUUID()
  pending.set(proposalId, { userId: profile.id, role: profile.role, kind, payload, conversationId, descricao, criadoEm: now })
  return { proposalId }
}

// Observabilidade/teste: quantas propostas pendentes há em memória agora (§16).
export function pendingCount() {
  return pending.size
}

export function takeProposal(proposalId, profile, now = Date.now()) {
  const p = pending.get(proposalId)
  if (!p) return null
  pending.delete(proposalId) // uso único, mesmo se inválida
  if (p.userId !== profile.id) return null
  if (now - p.criadoEm > PROPOSAL_TTL_MS) return null
  return { kind: p.kind, payload: p.payload, conversationId: p.conversationId, descricao: p.descricao }
}
