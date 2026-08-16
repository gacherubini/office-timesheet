import { describe, it, expect } from 'vitest'
import { aplicarEventoMensagem } from './agentBolha.js'

const vazia = { autor: 'bot', texto: '' }

describe('aplicarEventoMensagem — pintura da bolha', () => {
  it('token concatena no texto da bolha', () => {
    const a = aplicarEventoMensagem(vazia, { type: 'token', text: 'Ol' })
    const b = aplicarEventoMensagem(a, { type: 'token', text: 'á' })
    expect(b.texto).toBe('Olá')
  })

  it('token_revoke apaga o texto pintado', () => {
    const pintada = aplicarEventoMensagem(vazia, { type: 'token', text: 'penso' })
    const revogada = aplicarEventoMensagem(pintada, { type: 'token_revoke' })
    expect(revogada.texto).toBe('')
  })

  it('answer substitui o texto acumulado e traz os links', () => {
    const pintada = aplicarEventoMensagem(vazia, { type: 'token', text: 'rascunho' })
    const final = aplicarEventoMensagem(pintada, {
      type: 'answer',
      text: 'Olá, tudo bem?',
      links: [{ href: '/projetos', label: 'Projetos' }],
    })
    expect(final.texto).toBe('Olá, tudo bem?')
    expect(final.links).toEqual([{ href: '/projetos', label: 'Projetos' }])
  })
})
