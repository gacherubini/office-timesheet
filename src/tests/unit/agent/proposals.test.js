import { describe, it, expect } from 'vitest'
import { createProposal, takeProposal, PROPOSAL_TTL_MS } from '../../../lib/agent/proposals.js'

const emp = { id: 1, role: 'employee' }
const outro = { id: 2, role: 'employee' }

describe('proposals — pendências em memória, uso único, TTL', () => {
  it('cria e consome uma vez só', () => {
    const { proposalId } = createProposal({ profile: emp, kind: 'encerrar_apontamento', payload: { entry_id: 9 }, now: 1000 })
    const p = takeProposal(proposalId, emp, 1000)
    expect(p.payload.entry_id).toBe(9)
    expect(takeProposal(proposalId, emp, 1000)).toBeNull() // já consumida
  })

  it('nega proposta de outro usuário', () => {
    const { proposalId } = createProposal({ profile: emp, kind: 'x', payload: {}, now: 1000 })
    expect(takeProposal(proposalId, outro, 1000)).toBeNull()
  })

  it('expira após o TTL', () => {
    const { proposalId } = createProposal({ profile: emp, kind: 'x', payload: {}, now: 1000 })
    expect(takeProposal(proposalId, emp, 1000 + PROPOSAL_TTL_MS + 1)).toBeNull()
  })
})
