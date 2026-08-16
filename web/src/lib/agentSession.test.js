import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { lerSessao, salvarSessao, limparSessao, TTL_MS } from './agentSession.js'

// localStorage falso (o vitest roda em node, sem DOM). Simples Map por trás.
function fakeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get size() { return m.size },
  }
}

beforeEach(() => { globalThis.localStorage = fakeStorage() })
afterEach(() => { delete globalThis.localStorage })

describe('agentSession v2 — só conversationId + userId', () => {
  it('TTL é 30 dias', () => {
    expect(TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('salva e restaura conversationId do mesmo usuário', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc' })
    expect(lerSessao('u-1')).toEqual({ conversationId: 'conv-abc' })
    expect(lerSessao('u-1').mensagens).toBeUndefined()
  })

  it('não devolve a conversa de OUTRO usuário (escopo por id)', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc' })
    expect(lerSessao('u-2')).toBeNull()
  })

  it('ignora v1 com mensagens[] (some no primeiro lerSessao)', () => {
    globalThis.localStorage.setItem('assistente:sessao', JSON.stringify({
      v: 1,
      userId: 'u-1',
      conversationId: 'old',
      mensagens: [{ autor: 'user', texto: 'oi' }],
      updatedAt: Date.now(),
    }))
    expect(lerSessao('u-1')).toBeNull()
    expect(globalThis.localStorage.size).toBe(0)
  })

  it('expira depois do TTL (30 dias) e limpa o registro', () => {
    const t0 = 1_000_000
    salvarSessao('u-1', { conversationId: 'conv-abc' }, t0)
    expect(lerSessao('u-1', t0 + TTL_MS - 1)).not.toBeNull()
    expect(lerSessao('u-1', t0 + TTL_MS + 1)).toBeNull()
    expect(globalThis.localStorage.size).toBe(0)
  })

  it('sem conversationId não deixa lixo salvo', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc' })
    salvarSessao('u-1', { conversationId: null })
    expect(lerSessao('u-1')).toBeNull()
    expect(globalThis.localStorage.size).toBe(0)
  })

  it('limparSessao remove o registro', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc' })
    limparSessao()
    expect(lerSessao('u-1')).toBeNull()
  })

  it('JSON corrompido no storage não quebra — devolve null', () => {
    globalThis.localStorage.setItem('assistente:sessao', '{corrompido')
    expect(lerSessao('u-1')).toBeNull()
  })

  it('sem localStorage (SSR/ambiente sem DOM) degrada sem lançar', () => {
    delete globalThis.localStorage
    expect(() => salvarSessao('u-1', { conversationId: 'x' })).not.toThrow()
    expect(lerSessao('u-1')).toBeNull()
  })
})
