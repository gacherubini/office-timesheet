// Propostas de escrita pendentes, em memória, uso único, TTL curto (§16).
// O cliente recebe só o proposal_id; o payload nunca sai do servidor.
import { randomUUID } from 'node:crypto'

export const PROPOSAL_TTL_MS = 5 * 60 * 1000

const pending = new Map() // id → { userId, role, kind, payload, criadoEm }

export function createProposal({ profile, kind, payload, now = Date.now() }) {
  const proposalId = randomUUID()
  pending.set(proposalId, { userId: profile.id, role: profile.role, kind, payload, criadoEm: now })
  return { proposalId }
}

export function takeProposal(proposalId, profile, now = Date.now()) {
  const p = pending.get(proposalId)
  if (!p) return null
  pending.delete(proposalId) // uso único, mesmo se inválida
  if (p.userId !== profile.id) return null
  if (now - p.criadoEm > PROPOSAL_TTL_MS) return null
  return { kind: p.kind, payload: p.payload }
}
