import { describe, it, expect } from 'vitest'
import { textoDaFonte, resumoDasFontes } from './agentFontes.js'

describe('textoDaFonte', () => {
  it('junta rótulo, detalhe e contagem', () => {
    expect(textoDaFonte({ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 }))
      .toBe('Custo por projeto · este mês · 14 linhas')
  })

  it('uma linha é singular', () => {
    expect(textoDaFonte({ rotulo: 'Status do projeto', detalhe: '', count: 1 }))
      .toBe('Status do projeto · 1 linha')
  })

  it('zero linhas é informação, não ausência — aparece', () => {
    expect(textoDaFonte({ rotulo: 'Quem não apontou', detalhe: 'esta semana', count: 0 }))
      .toBe('Quem não apontou · esta semana · 0 linhas')
  })

  it('count nulo some em vez de virar zero', () => {
    expect(textoDaFonte({ rotulo: 'Listar equipe', detalhe: '', count: null }))
      .toBe('Listar equipe')
  })

  it('fonte sem rótulo não vira texto', () => {
    expect(textoDaFonte({})).toBe('')
    expect(textoDaFonte(null)).toBe('')
  })
})

describe('resumoDasFontes', () => {
  it('uma fonte se explica sozinha', () => {
    expect(resumoDasFontes([{ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 }]))
      .toBe('Custo por projeto · este mês · 14 linhas')
  })

  it('duas ou mais viram contagem — o detalhe fica no expandir', () => {
    expect(resumoDasFontes([
      { rotulo: 'Listar equipe', count: 8 },
      { rotulo: 'Custo por projeto', count: 3 },
    ])).toBe('2 consultas')
  })

  it('lista vazia ou ausente não gera rodapé', () => {
    expect(resumoDasFontes([])).toBe('')
    expect(resumoDasFontes(undefined)).toBe('')
  })

  it('entrada quebrada é ignorada em vez de virar linha vazia', () => {
    expect(resumoDasFontes([{ rotulo: 'Listar equipe', count: 8 }, null, {}]))
      .toBe('Listar equipe · 8 linhas')
  })
})
