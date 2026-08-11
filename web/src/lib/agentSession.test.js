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

const msgs = [
  { autor: 'user', texto: 'quantas horas lancei?' },
  { autor: 'bot', texto: 'Você lançou 12h este mês.' },
]

describe('agentSession — persistência local da conversa do Assistente', () => {
  it('salva e restaura conversationId + mensagens do mesmo usuário', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc', mensagens: msgs })
    const lido = lerSessao('u-1')
    expect(lido).toEqual({ conversationId: 'conv-abc', mensagens: msgs })
  })

  it('não devolve a conversa de OUTRO usuário (escopo por id)', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc', mensagens: msgs })
    expect(lerSessao('u-2')).toBeNull()
  })

  it('expira depois do TTL (30 min) e limpa o registro', () => {
    const t0 = 1_000_000
    salvarSessao('u-1', { conversationId: 'conv-abc', mensagens: msgs }, t0)
    // Ainda dentro da janela: restaura.
    expect(lerSessao('u-1', t0 + TTL_MS - 1)).not.toBeNull()
    // Passou do TTL: null e apaga.
    expect(lerSessao('u-1', t0 + TTL_MS + 1)).toBeNull()
    expect(globalThis.localStorage.size).toBe(0)
  })

  it('conversa vazia e sem id não deixa lixo salvo', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc', mensagens: msgs })
    salvarSessao('u-1', { conversationId: null, mensagens: [] })
    expect(lerSessao('u-1')).toBeNull()
    expect(globalThis.localStorage.size).toBe(0)
  })

  it('limpa flags transitórias (executando) ao salvar', () => {
    salvarSessao('u-1', {
      conversationId: 'conv-abc',
      mensagens: [{ autor: 'bot', texto: 'ok', executando: true }],
    })
    expect(lerSessao('u-1').mensagens[0].executando).toBe(false)
  })

  it('não persiste o File do anexo — JSON.stringify o viraria {} e quebraria o reenvio', () => {
    // Stand-in do File: o ambiente de teste é Node, sem File nativo. O que
    // importa é que a chave seja descartada na serialização.
    const arquivoObj = { name: 'briefing.pdf', size: 1234 }
    salvarSessao(1, {
      conversationId: 'c1',
      mensagens: [{ autor: 'user', texto: 'resume isso', anexo: 'briefing.pdf', arquivoObj }],
    })
    const lido = lerSessao(1)
    expect(lido.mensagens[0].anexo).toBe('briefing.pdf')   // o nome fica, é só exibição
    expect(lido.mensagens[0].arquivoObj).toBeUndefined()   // o objeto, não
  })

  it('limparSessao remove o registro', () => {
    salvarSessao('u-1', { conversationId: 'conv-abc', mensagens: msgs })
    limparSessao()
    expect(lerSessao('u-1')).toBeNull()
  })

  it('JSON corrompido no storage não quebra — devolve null', () => {
    globalThis.localStorage.setItem('assistente:sessao', '{corrompido')
    expect(lerSessao('u-1')).toBeNull()
  })

  it('sem localStorage (SSR/ambiente sem DOM) degrada sem lançar', () => {
    delete globalThis.localStorage
    expect(() => salvarSessao('u-1', { conversationId: 'x', mensagens: msgs })).not.toThrow()
    expect(lerSessao('u-1')).toBeNull()
  })
})
