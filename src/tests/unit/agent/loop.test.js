import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import { clearTestSink } from '../../../lib/logger.js'
import * as proposals from '../../../lib/agent/proposals.js'

const admin = { id: 1, role: 'admin' }

// Cliente falso: cada chamada a stream() devolve o próximo passo roteirizado.
function fakeClient(steps) {
  let i = 0
  return {
    async stream(_params, onToken) {
      const step = steps[i++]
      if (step.token) onToken(step.token)
      return { message: step.message, usage: step.usage || { prompt_tokens: 10, completion_tokens: 5 } }
    },
  }
}

describe('loop — tool-calling agnóstico', () => {
  beforeEach(() => clearTestSink())

  it('executa uma tool de leitura e depois emite a resposta final (evento answer)', async () => {
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'listar_equipe', arguments: '{}' } }] } },
      { message: { role: 'assistant', content: 'Temos 1 pessoa.' } },
    ])
    const respostas = []
    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'quem está no time?' }],
      emit: (e) => e.type === 'answer' && respostas.push(e.text),
    })
    expect(res.status).toBe('done')
    // A resposta final sai num único evento 'answer'; o raciocínio das iterações
    // intermediárias (com tool_calls) NÃO é emitido.
    expect(respostas).toEqual(['Temos 1 pessoa.'])
    // houve uma mensagem role:'tool' no meio (resultado da leitura):
    expect(res.messages.some((m) => m.role === 'tool')).toBe(true)
  })

  it('numa tool de escrita, emite proposta e pausa (awaiting_confirmation)', async () => {
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_encerrar_apontamento', arguments: '{}' } }] } },
    ])
    // A tool de escrita é chamada de verdade; isola-se só o propose:
    const eventos = []
    const spy = vi.spyOn(proposals, 'createProposal').mockReturnValue({ proposalId: 'p1' })
    const toolMod = await import('../../../lib/agent/tools/write/proporEncerrarApontamento.js')
    vi.spyOn(toolMod.default, 'propose').mockResolvedValue({
      kind: 'encerrar_apontamento', payload: { entry_id: 9 },
      descricao: 'Encerrar apontamento X', dados: { entry_id: 9 },
    })

    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'encerra meu apontamento' }],
      emit: (e) => eventos.push(e),
    })
    expect(res.status).toBe('awaiting_confirmation')
    const prop = eventos.find((e) => e.type === 'proposal')
    expect(prop.proposalId).toBe('p1')
    expect(prop.descricao).toMatch(/Encerrar apontamento/)
    spy.mockRestore()
  })
})
