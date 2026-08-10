import { describe, it, expect } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'

const admin = { id: 1, role: 'admin' }

// Cobre a lógica de cancelamento do laço (§2): quando o AbortSignal está ativo, o
// laço para na próxima iteração e não chama o modelo de novo. Usa uma tool
// inexistente para não tocar no banco — o interesse aqui é só o controle de fluxo.
describe('loop — cancelamento por AbortSignal (desconexão do cliente)', () => {
  it('flag setada entre iterações: para e devolve status aborted, sem nova chamada', async () => {
    const ac = new AbortController()
    let chamadas = 0
    const client = {
      async stream() {
        chamadas++
        // Simula o cliente desconectando DURANTE a 1ª chamada.
        ac.abort()
        return {
          message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ferramenta_inexistente', arguments: '{}' } }] },
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }
      },
    }

    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: () => {}, signal: ac.signal,
    })

    expect(res.status).toBe('aborted')
    expect(chamadas).toBe(1) // a 2ª iteração parou no topo, sem chamar o modelo
  })

  it('signal já abortado antes de começar: nem chama o modelo', async () => {
    const ac = new AbortController()
    ac.abort()
    let chamadas = 0
    const client = { async stream() { chamadas++; return { message: { role: 'assistant', content: 'x' }, usage: {} } } }

    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: () => {}, signal: ac.signal,
    })

    expect(res.status).toBe('aborted')
    expect(chamadas).toBe(0)
  })
})
