import { describe, it, expect } from 'vitest'
import { COLUMNS, statusLabel } from './helpers'

describe('COLUMNS do quadro', () => {
  it('tem cinco colunas na ordem do PDF', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['todo', 'in_progress', 'blocked', 'in_review', 'done'])
  })

  it('"Falta info" fica ENTRE fazendo e em revisão', () => {
    const chaves = COLUMNS.map((c) => c.key)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_progress') + 1)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_review') - 1)
  })

  it('o rótulo é "Falta info"', () => {
    expect(COLUMNS.find((c) => c.key === 'blocked').label).toBe('Falta info')
    expect(statusLabel('blocked')).toBe('Falta info')
  })

  it('os rótulos existentes não mudaram', () => {
    expect(statusLabel('todo')).toBe('A fazer')
    expect(statusLabel('in_progress')).toBe('Fazendo')
    expect(statusLabel('in_review')).toBe('Em revisão')
    expect(statusLabel('done')).toBe('Concluído')
    expect(statusLabel('abandoned')).toBe('Abandonado')
  })
})
