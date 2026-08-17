/** @vitest-environment jsdom */
// Depois do wipe do banco, navegadores com token da base antiga passaram a
// receber 403 "Perfil não encontrado" — o usuário daquele token não existe
// mais. Só o 401 derrubava a sessão, então o app mostrava erro genérico em vez
// de mandar pro login, e o JWT ainda tinha 7 dias de validade pela frente.
//
// A parte delicada: 403 TAMBÉM é "você não tem permissão para esta ação" (o
// execute do agente devolve isso). Deslogar alguém por tentar uma ação que não
// pode seria pior que o bug original. Por isso o corte é pelas mensagens
// específicas do requireAuth, e o teste que mais importa aqui é o que garante
// que a falta de permissão NÃO desloga.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api.js'

function respostaDe(status, corpo) {
  return new Response(corpo === undefined ? '' : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let navegouPara

beforeEach(() => {
  localStorage.setItem('access_token', 'tok')
  localStorage.setItem('user', '{}')
  localStorage.setItem('profile', '{}')
  navegouPara = null
  // jsdom não navega de verdade; sem isto ele emite "Not implemented:
  // navigation" no console a cada teste.
  delete window.location
  window.location = { set href(v) { navegouPara = v } , get href() { return navegouPara } }
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const temSessao = () => localStorage.getItem('access_token') !== null

describe('api — sessão morta derruba para o login', () => {
  it('401 limpa o storage e manda pro login', async () => {
    globalThis.fetch = vi.fn(async () => respostaDe(401, { error: 'Token inválido.' }))
    await expect(api.get('/qualquer')).rejects.toThrow(/sessão expirada/i)
    expect(temSessao()).toBe(false)
    expect(navegouPara).toBe('/login')
  })

  // As três do requireAuth (middleware/auth.js): identidade do token não vale
  // mais. Insistir não adianta — precisa relogar.
  it.each([
    'Perfil não encontrado.',
    'Usuário deletado.',
    'Usuário inativo.',
  ])('403 "%s" também derruba a sessão', async (mensagem) => {
    globalThis.fetch = vi.fn(async () => respostaDe(403, { error: mensagem }))
    await expect(api.get('/me')).rejects.toThrow(/sessão expirada/i)
    expect(temSessao()).toBe(false)
    expect(navegouPara).toBe('/login')
  })
})

describe('api — falta de permissão NÃO desloga', () => {
  it('403 de permissão preserva a sessão e propaga a mensagem', async () => {
    globalThis.fetch = vi.fn(async () => respostaDe(403, { error: 'Sem permissão para esta ação.' }))
    await expect(api.post('/agent/actions/x/execute', {}))
      .rejects.toThrow('Sem permissão para esta ação.')
    expect(temSessao()).toBe(true)
    expect(navegouPara).toBeNull()
  })

  it('403 sem corpo conhecido também preserva a sessão', async () => {
    globalThis.fetch = vi.fn(async () => respostaDe(403, { error: 'Proibido.' }))
    await expect(api.get('/admin/qualquer')).rejects.toThrow('Proibido.')
    expect(temSessao()).toBe(true)
  })
})

describe('api — caminho feliz segue igual', () => {
  it('200 devolve o corpo', async () => {
    globalThis.fetch = vi.fn(async () => respostaDe(200, { items: [1, 2] }))
    await expect(api.get('/x')).resolves.toEqual({ items: [1, 2] })
    expect(temSessao()).toBe(true)
  })

  it('204 devolve null sem tentar parsear', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }))
    await expect(api.delete('/x')).resolves.toBeNull()
  })
})
