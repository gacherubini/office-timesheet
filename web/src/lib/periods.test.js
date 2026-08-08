import { describe, expect, it } from 'vitest'
import { getPeriodRange } from './periods'

describe('getPeriodRange', () => {
  it('mês corrente vai do dia 1 ao último dia', () => {
    expect(getPeriodRange('month', '2026-08-07')).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })

  it('semana começa na segunda e termina no domingo', () => {
    expect(getPeriodRange('week', '2026-08-07')).toEqual({
      start_date: '2026-08-03',
      end_date: '2026-08-09',
    })
  })

  it('trimestre cobre os três meses do bloco', () => {
    expect(getPeriodRange('quarter', '2026-08-07')).toEqual({
      start_date: '2026-07-01',
      end_date: '2026-09-30',
    })
  })

  it('vira o ano corretamente na virada de trimestre', () => {
    expect(getPeriodRange('quarter', '2026-01-15')).toEqual({
      start_date: '2026-01-01',
      end_date: '2026-03-31',
    })
  })
})
