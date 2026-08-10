import { describe, it, expect, afterEach } from 'vitest'
import { getClient, setClient, resetClient, DEFAULT_BASE_URL, DEFAULT_MODEL } from '../../../lib/agent/client.js'

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

describe('client — defaults do provedor real', () => {
  it('default aponta para a NVIDIA e o DeepSeek V4 Flash', () => {
    expect(DEFAULT_BASE_URL).toBe('https://integrate.api.nvidia.com/v1')
    expect(DEFAULT_MODEL).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })
})
