import { describe, it, expect, afterEach } from 'vitest'
import {
  getClient, setClient, resetClient, makeRealClient,
  DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TEMPERATURE,
} from '../../../lib/agent/client.js'

afterEach(() => resetClient())

describe('client — injeção e contrato', () => {
  it('getClient devolve o cliente real por padrão (tem stream)', () => {
    expect(typeof getClient().stream).toBe('function')
  })

  it('setClient troca o cliente ativo (para testes/roteirização)', async () => {
    const fake = {
      async stream(_params, onDelta) {
        onDelta({ content: 'oi' })
        return { message: { role: 'assistant', content: 'oi' }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
      },
    }
    setClient(fake)
    const tokens = []
    const { message } = await getClient().stream({ messages: [], tools: [], model: 'x' }, (t) => tokens.push(t))
    expect(tokens).toEqual([{ content: 'oi' }])
    expect(message.content).toBe('oi')
  })
})

describe('client — defaults do provedor real', () => {
  it('default aponta para a API oficial da DeepSeek e o V4 Flash', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.deepseek.com')
    expect(DEFAULT_MODEL).toBe('deepseek-v4-flash')
  })
})

// SDK falso que só guarda os params recebidos — o que interessa aqui é O QUE
// mandamos ao provedor, não o que volta.
function fakeOpenAICapturando(capturado) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          Object.assign(capturado, params)
          return (async function* () {
            yield { choices: [{ delta: { content: 'ok' } }] }
          })()
        },
      },
    },
  }
}

describe('client — temperatura', () => {
  const original = process.env.AGENT_TEMPERATURE
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_TEMPERATURE
    else process.env.AGENT_TEMPERATURE = original
  })

  it('manda temperatura explícita em vez de herdar o default do provedor', async () => {
    // O invariante é mandar o campo e ficar abaixo de 1.0 — o valor exato é
    // escolha de produto e muda por env. Sem o campo, o provedor assume 1.0 e a
    // escolha de ferramenta oscila entre execuções (visto em 2026-08-11).
    delete process.env.AGENT_TEMPERATURE
    const params = {}
    await makeRealClient(fakeOpenAICapturando(params)).stream({ messages: [], tools: [], model: 'x' }, () => {})
    expect(params.temperature).toBe(DEFAULT_TEMPERATURE)
    expect(DEFAULT_TEMPERATURE).toBeLessThan(1)
  })

  it('AGENT_TEMPERATURE sobrepõe e respeita o 0 explícito', async () => {
    process.env.AGENT_TEMPERATURE = '0'
    const params = {}
    await makeRealClient(fakeOpenAICapturando(params)).stream({ messages: [], tools: [], model: 'x' }, () => {})
    expect(params.temperature).toBe(0)
  })
})

describe('client — signal, max_tokens e onDelta estruturado', () => {
  it('create recebe signal e max_tokens vem de LIMITS.maxTokens', async () => {
    const { LIMITS } = await import('../../../lib/agent/guards.js')
    const ac = new AbortController()
    const capturado = {}
    const openai = {
      chat: { completions: { create: async (params) => {
        Object.assign(capturado, params)
        return (async function* () { yield { choices: [{ delta: { content: 'ok' } }] } })()
      } } },
    }
    const deltas = []
    await makeRealClient(openai).stream({ messages: [], tools: [], model: 'x' }, (d) => deltas.push(d), { signal: ac.signal })
    expect(capturado.signal).toBe(ac.signal)
    expect(capturado.max_tokens).toBe(LIMITS.maxTokens)
    expect(deltas).toEqual([{ content: 'ok' }])
  })

  it('delta.reasoning_content não vira content nem onDelta de texto', async () => {
    const openai = {
      chat: { completions: { create: async () => (async function* () {
        yield { choices: [{ delta: { reasoning_content: 'penso' } }] }
        yield { choices: [{ delta: { content: 'resposta' } }] }
      })() } },
    }
    const deltas = []
    const { message } = await makeRealClient(openai).stream({ messages: [], tools: [], model: 'x' }, (d) => deltas.push(d))
    expect(message.content).toBe('resposta')
    // reasoning notifica o cano mas nunca vira texto em content
    expect(deltas).toEqual([{ reasoning: true }, { content: 'resposta' }])
  })

  it('primeiro delta de tool_calls notifica toolCall:true e não soma em content', async () => {
    const openai = {
      chat: { completions: { create: async () => (async function* () {
        yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'listar_equipe', arguments: '{}' } }] } }] }
      })() } },
    }
    const deltas = []
    const { message } = await makeRealClient(openai).stream({ messages: [], tools: [], model: 'x' }, (d) => deltas.push(d))
    expect(deltas).toEqual([{ toolCall: true }])
    expect(message.content).toBeNull()
    expect(message.tool_calls[0].function.name).toBe('listar_equipe')
  })
})
