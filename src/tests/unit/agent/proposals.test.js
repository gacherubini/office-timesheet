import { describe, it, expect } from 'vitest'
import { createProposal, takeProposal, pendingCount, PROPOSAL_TTL_MS } from '../../../lib/agent/proposals.js'

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

  it('varre propostas vencidas ao criar (não vaza memória)', () => {
    // base bem à frente dos outros testes: propostas nunca aprovadas venceriam e
    // ficariam para sempre; a criação seguinte precisa expurgá-las.
    const base = 10_000_000
    createProposal({ profile: emp, kind: 'x', payload: {}, now: base }) // duas velhas
    createProposal({ profile: emp, kind: 'x', payload: {}, now: base })
    createProposal({ profile: emp, kind: 'x', payload: {}, now: base + PROPOSAL_TTL_MS + 1 })
    // As duas velhas venceram; só a recém-criada sobrou.
    expect(pendingCount()).toBe(1)
  })

  it('não entrega a proposta se o papel mudou entre propor e aprovar', () => {
    // O requireAuth relê o profile do banco a cada request, então uma troca de
    // papel no meio do caminho chega aqui. A proposta é do par (dono, papel):
    // quem propôs como admin não executa como employee.
    const { proposalId } = createProposal({
      profile: { id: 1, role: 'admin' },
      kind: 'criar_task',
      payload: { title: 'x' },
    })
    expect(takeProposal(proposalId, { id: 1, role: 'employee' })).toBeNull()
  })

  it('mesmo dono e mesmo papel continua entregando', () => {
    const { proposalId } = createProposal({
      profile: { id: 1, role: 'admin' },
      kind: 'criar_task',
      payload: { title: 'x' },
    })
    expect(takeProposal(proposalId, { id: 1, role: 'admin' })).toMatchObject({ kind: 'criar_task' })
  })
})
