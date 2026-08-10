import { describe, it, expect } from 'vitest'
import { dateInSaoPaulo, yearMonthInSaoPaulo } from '../../lib/dates.js'

describe('dates — fuso America/Sao_Paulo', () => {
  it('dateInSaoPaulo formata YYYY-MM-DD no fuso do estúdio', () => {
    // 2026-08-10 01:30 UTC = 2026-08-09 22:30 SP
    const nightInSp = new Date('2026-08-10T01:30:00.000Z')
    expect(dateInSaoPaulo(nightInSp)).toBe('2026-08-09')

    // 2026-08-10 03:00 UTC = 2026-08-10 00:00 SP
    const midnightSp = new Date('2026-08-10T03:00:00.000Z')
    expect(dateInSaoPaulo(midnightSp)).toBe('2026-08-10')
  })

  it('yearMonthInSaoPaulo não vira o mês na janela 21h–00h BRT', () => {
    // 31/jul 23:30 SP = 01/ago 02:30 UTC
    const endOfJulySp = new Date('2026-08-01T02:30:00.000Z')
    expect(yearMonthInSaoPaulo(endOfJulySp)).toEqual({ year: 2026, month: 7 })

    // 01/ago 00:10 SP = 01/ago 03:10 UTC
    const startOfAugSp = new Date('2026-08-01T03:10:00.000Z')
    expect(yearMonthInSaoPaulo(startOfAugSp)).toEqual({ year: 2026, month: 8 })
  })
})
