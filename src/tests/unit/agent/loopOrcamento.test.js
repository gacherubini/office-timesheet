import { describe, it, expect } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'

// Cliente que sempre pede uma tool inexistente: o loop empurra "indisponível" e
// segue — sem tocar no banco. Sem orçamento, iria até maxIterations. profile.id
// numérico faz o usageRepo.insert virar no-op (não precisa de DB neste unit test).
const clienteEmLoop = {
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

describe('orçamento de relógio do turno', () => {
  it('estoura o teto de tempo → responde fallback e para de chamar o modelo', async () => {
    // Relógio falso: início=0, 1ª volta dentro do teto, 2ª já estourou.
    const tempos = [0, 0, 10_000_000]
    let i = 0
    const now = () => tempos[Math.min(i++, tempos.length - 1)]

    const eventos = []
    const r = await runAgentTurn({
      client: clienteEmLoop,
      profile: { id: 1, role: 'admin' },
      model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
      now,
    })

    expect(r.status).toBe('done')
    const answer = eventos.find((e) => e.type === 'answer')
    expect(answer?.text).toMatch(/tempo|reformul|refin/i)
    // Não pode ter emitido proposta nem resposta de verdade — foi corte por tempo.
    expect(eventos.find((e) => e.type === 'proposal')).toBeUndefined()
  })
})
