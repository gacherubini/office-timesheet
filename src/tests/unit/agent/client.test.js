import { describe, it, expect, afterEach } from 'vitest'
import { getClient, setClient, resetClient } from '../../../lib/agent/client.js'

afterEach(() => resetClient())

describe('client — injeção e contrato', () => {
  it('getClient devolve o cliente real por padrão (tem stream)', () => {
    expect(typeof getClient().stream).toBe('function')
  })

  it('setClient troca o cliente ativo (para testes/roteirização)', async () => {
    const fake = {
      async stream(_params, onToken) {
        onToken('oi')
        return { message: { role: 'assistant', content: 'oi' }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
      },
    }
    setClient(fake)
    const tokens = []
    const { message } = await getClient().stream({ messages: [], tools: [], model: 'x' }, (t) => tokens.push(t))
    expect(tokens).toEqual(['oi'])
    expect(message.content).toBe('oi')
  })
})
