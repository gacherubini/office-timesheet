import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import * as usageRepo from '../../../lib/agent/usageRepo.js'

// Cliente preso: pede sempre uma tool inexistente, então o loop empurra
// "indisponível" e segue até esgotar maxIterations SEM nunca convergir numa
// resposta. Relógio real (iterações instantâneas não estouram o orçamento de
// 45s), então quem corta é o teto de iterações — o beco que antes lançava
// "limite de iterações do agente atingido" cru pro usuário.
const clientePreso = {
  async stream() {
    return {
      message: {
        role: 'assistant',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'nao_existe', arguments: '{}' } }],
      },
      usage: {},
    }
  },
}

describe('teto de iterações → esclarecimento gracioso (nunca erro cru)', () => {
  beforeEach(() => { vi.spyOn(usageRepo, 'insert').mockResolvedValue() })
  afterEach(() => vi.restoreAllMocks())

  it('esgota as iterações e emite um answer amigável em vez de lançar erro', async () => {
    const eventos = []
    const r = await runAgentTurn({
      client: clientePreso,
      profile: { id: 1, role: 'admin' }, // id numérico: usageRepo.insert vira no-op (sem DB)
      model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })

    // Termina são, não estoura.
    expect(r.status).toBe('done')

    // Usuário vê uma resposta que pede pra reformular — não um cartão de erro.
    const answer = eventos.find((e) => e.type === 'answer')
    expect(answer).toBeDefined()
    expect(answer.text.trim()).toBeTruthy()
    expect(answer.text).toMatch(/reformul|outras palavras|não consegui/i)

    // Nada de jargão interno vazando, nem evento de erro.
    expect(answer.text).not.toMatch(/iteraç|limite|tool|agente atingido/i)
    expect(eventos.find((e) => e.type === 'error')).toBeUndefined()
  })

  it('não deixa assistant malformado no histórico (bem-formado, reenviável sem 400)', async () => {
    const r = await runAgentTurn({
      client: clientePreso,
      profile: { id: 1, role: 'admin' },
      model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: () => {},
    })
    // Todo assistant no histórico tem content OU tool_calls — o que a DeepSeek exige.
    const malformada = r.messages.find(
      (m) => m.role === 'assistant' && !m.content && !(m.tool_calls?.length),
    )
    expect(malformada).toBeUndefined()
  })
})
