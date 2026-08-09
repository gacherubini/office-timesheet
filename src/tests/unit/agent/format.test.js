import { describe, it, expect } from 'vitest'
import { TZ, formatBRL, formatDateBR, resolvePeriodo } from '../../../lib/agent/format.js'

describe('format — localização', () => {
  it('TZ é o fuso do estúdio', () => {
    expect(TZ).toBe('America/Sao_Paulo')
  })

  it('formatBRL usa vírgula decimal e ponto de milhar', () => {
    expect(formatBRL(1234.5)).toMatch(/^R\$\s?1\.234,50$/)
    expect(formatBRL(0)).toMatch(/^R\$\s?0,00$/)
  })

  it('formatDateBR aceita string YYYY-MM-DD sem escorregar de fuso', () => {
    expect(formatDateBR('2026-08-08')).toBe('08/08/2026')
  })

  it('resolvePeriodo("hoje") devolve o mesmo dia no fuso SP', () => {
    // 2026-08-08T02:00:00Z ainda é 07/08 em São Paulo (UTC-3).
    const now = new Date('2026-08-08T02:00:00Z')
    expect(resolvePeriodo('hoje', now)).toEqual({ inicio: '2026-08-07', fim: '2026-08-07' })
  })

  it('resolvePeriodo("mes") cobre o mês corrente no fuso SP', () => {
    const now = new Date('2026-08-08T12:00:00Z')
    expect(resolvePeriodo('mes', now)).toEqual({ inicio: '2026-08-01', fim: '2026-08-31' })
  })
})
