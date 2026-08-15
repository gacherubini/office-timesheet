import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeRealClient, isTransient, isAbortError } from '../../../lib/agent/client.js'

// SDK OpenAI-compatible falso: cada create() consome o próximo comportamento da
// lista ({ throw } lança; senão devolve um stream com um token + usage).
// Guarda o último `params` do create (ex.: signal) em chamadas.lastParams.
function fakeOpenAI(comportamentos) {
  let i = 0
  const chamadas = { create: 0, lastParams: null }
  const openai = {
    chat: {
      completions: {
        create: async (params) => {
          chamadas.create++
          chamadas.lastParams = params
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

  it('AbortError / APIUserAbortError / signal.aborted NÃO são transient', () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    expect(isTransient(abort)).toBe(false)
    const apiAbort = new Error('Request was aborted')
    apiAbort.name = 'APIUserAbortError'
    expect(isTransient(apiAbort)).toBe(false)
    const ac = new AbortController()
    ac.abort()
    expect(isTransient(new Error('ECONNRESET'), ac.signal)).toBe(false)
    expect(isTransient(new Error('aborted by user'))).toBe(false)
    expect(isTransient(new Error('timeout'))).toBe(true) // timeout continua transient
  })

  it('isAbortError detecta AbortError, APIUserAbortError, signal e msg abort', () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    expect(isAbortError(abort)).toBe(true)
    const apiAbort = new Error('Request was aborted')
    apiAbort.name = 'APIUserAbortError'
    expect(isAbortError(apiAbort)).toBe(true)
    const ac = new AbortController()
    ac.abort()
    expect(isAbortError(new Error('rede'), ac.signal)).toBe(true)
    expect(isAbortError(new Error('aborted by user'))).toBe(true)
    expect(isAbortError(new Error('timeout'))).toBe(false)
    expect(isAbortError(new Error('ECONNRESET'))).toBe(false)
  })

  it('abort no meio do create NÃO entra no retry, mesmo comecouAEmitir=false', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const { openai, chamadas } = fakeOpenAI([{ throw: abort }])
    const client = makeRealClient(openai)
    await expect(client.stream({ messages: [], tools: [], model: 'x' }, () => {})).rejects.toMatchObject({ name: 'AbortError' })
    expect(chamadas.create).toBe(1)
  })

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
    const { message } = await client.stream({ messages: [], tools: [], model: 'x' }, (t) => {
      if (t.content) tokens.push(t.content)
    })
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
