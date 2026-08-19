import { describe, it, expect } from 'vitest'
import { tempoDeCasa } from './tempoDeCasa'

describe('tempoDeCasa', () => {
  it('sem data de admissão devolve null', () => {
    expect(tempoDeCasa(null, '2026-08-18')).toBeNull()
  })

  it('menos de um mês conta em dias', () => {
    expect(tempoDeCasa('2026-08-01', '2026-08-18')).toBe('17 dias')
  })

  it('um dia é singular', () => {
    expect(tempoDeCasa('2026-08-17', '2026-08-18')).toBe('1 dia')
  })

  it('meses inteiros', () => {
    expect(tempoDeCasa('2026-05-18', '2026-08-18')).toBe('3 meses')
  })

  it('um mês é singular', () => {
    expect(tempoDeCasa('2026-07-18', '2026-08-18')).toBe('1 mês')
  })

  it('anos e meses', () => {
    expect(tempoDeCasa('2024-03-01', '2026-08-18')).toBe('2 anos e 5 meses')
  })

  it('ano exato não mostra "e 0 meses"', () => {
    expect(tempoDeCasa('2025-08-18', '2026-08-18')).toBe('1 ano')
  })

  it('data futura devolve null em vez de tempo negativo', () => {
    expect(tempoDeCasa('2027-01-01', '2026-08-18')).toBeNull()
  })
})
