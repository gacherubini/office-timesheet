import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeRealClient, isTransient } from '../../../lib/agent/client.js'

// SDK OpenAI-compatible falso: cada create() consome o próximo comportamento da
// lista ({ throw } lança; senão devolve um stream com um token + usage).
function fakeOpenAI(comportamentos) {
  let i = 0
  const chamadas = { create: 0 }
  const openai = {
    chat: {
      completions: {
        create: async () => {
          chamadas.create++
          const b = comportamentos[i++] || {}
          if (b.throw) throw b.throw
          return (async function* () {
            yield { choices: [{ delta: { content: 'oi' } }] }
            yield { usage: { prompt_tokens: 3, completion_tokens: 2 }, choices: [{ delta: {} }] }
          })()
        },
      },
    },
  }
  return { openai, chamadas }
}

describe('client — retry/backoff explícito (§17)', () => {
  beforeEach(() => { process.env.AGENT_RETRY_BACKOFF_MS = '1' }) // backoff mínimo, teste rápido
  afterEach(() => { delete process.env.AGENT_RETRY_BACKOFF_MS })

  it('classifica erros: timeout/rede/429/5xx são transitórios; 4xx de validação não', () => {
    expect(isTransient(new Error('timeout'))).toBe(true)
    expect(isTransient(new Error('ECONNRESET'))).toBe(true) // sem status → transitório
    expect(isTransient(Object.assign(new Error('rate'), { status: 429 }))).toBe(true)
    expect(isTransient(Object.assign(new Error('boom'), { status: 503 }))).toBe(true)
    expect(isTransient(Object.assign(new Error('bad'), { status: 400 }))).toBe(false)
    expect(isTransient(Object.assign(new Error('unauth'), { status: 401 }))).toBe(false)
  })

  it('falha 1x com erro transitório e sucede na 2ª tentativa', async () => {
    const { openai, chamadas } = fakeOpenAI([{ throw: new Error('ECONNRESET') }, { ok: true }])
    const client = makeRealClient(openai)
    const tokens = []
    const { message } = await client.stream({ messages: [], tools: [], model: 'x' }, (t) => tokens.push(t))
    expect(message.content).toBe('oi')
    expect(tokens).toEqual(['oi']) // sem token duplicado
    expect(chamadas.create).toBe(2)
  })

  it('não retenta em 4xx de validação: uma chamada só e erro claro', async () => {
    const { openai, chamadas } = fakeOpenAI([{ throw: Object.assign(new Error('bad request'), { status: 400 }) }])
    const client = makeRealClient(openai)
    await expect(client.stream({ messages: [], tools: [], model: 'x' }, () => {})).rejects.toThrow(/não respondeu/i)
    expect(chamadas.create).toBe(1)
  })

  it('esgota as tentativas e lança mensagem final clara (sem fallback silencioso)', async () => {
    process.env.AGENT_MAX_RETRIES = '2'
    const { openai, chamadas } = fakeOpenAI([{ throw: new Error('t1') }, { throw: new Error('t2') }, { throw: new Error('t3') }])
    const client = makeRealClient(openai)
    await expect(client.stream({ messages: [], tools: [], model: 'x' }, () => {})).rejects.toThrow(/após 3 tentativa/i)
    expect(chamadas.create).toBe(3) // 1 + 2 retries
    delete process.env.AGENT_MAX_RETRIES
  })
})
