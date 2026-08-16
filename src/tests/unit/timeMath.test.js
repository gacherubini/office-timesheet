import { describe, it, expect } from 'vitest'
import {
  calculateDurationMinutes,
  calculateCostSnapshot,
  netDurationMinutes,
  rateFromSnapshot,
  sameInstant,
} from '../../lib/timeMath.js'

const at = (ms) => new Date(ms)

describe('calculateDurationMinutes (arredondamento meia-pra-cima, nunca negativo)', () => {
  it('intervalo zero → 0', () => {
    expect(calculateDurationMinutes(at(0), at(0))).toBe(0)
  })
  it('29s → 0 (abaixo de meio minuto)', () => {
    expect(calculateDurationMinutes(at(0), at(29_000))).toBe(0)
  })
  it('30s → 1 (meia pra cima)', () => {
    expect(calculateDurationMinutes(at(0), at(30_000))).toBe(1)
  })
  it('89s → 1', () => {
    expect(calculateDurationMinutes(at(0), at(89_000))).toBe(1)
  })
  it('90s → 2', () => {
    expect(calculateDurationMinutes(at(0), at(90_000))).toBe(2)
  })
  it('1h → 60', () => {
    expect(calculateDurationMinutes(at(0), at(3_600_000))).toBe(60)
  })
  it('fim antes do início → 0 (nunca negativo)', () => {
    expect(calculateDurationMinutes(at(60_000), at(0))).toBe(0)
  })
})

describe('calculateCostSnapshot (horas × rate, 2 casas)', () => {
  it('60 min a 100/h = 100.00', () => {
    expect(calculateCostSnapshot(60, 100)).toBe(100)
  })
  it('90 min a 100/h = 150.00', () => {
    expect(calculateCostSnapshot(90, 100)).toBe(150)
  })
  it('30 min a 100/h = 50.00', () => {
    expect(calculateCostSnapshot(30, 100)).toBe(50)
  })
  it('1 min a 100/h = 1.67 (arredonda 2 casas)', () => {
    expect(calculateCostSnapshot(1, 100)).toBe(1.67)
  })
  it('481 min a 137.50/h = 1102.29', () => {
    expect(calculateCostSnapshot(481, 137.5)).toBe(1102.29)
  })
  it('rate 0 → 0', () => {
    expect(calculateCostSnapshot(120, 0)).toBe(0)
  })
  it('rate null/undefined → 0 (sem crash)', () => {
    expect(calculateCostSnapshot(120, null)).toBe(0)
    expect(calculateCostSnapshot(120, undefined)).toBe(0)
  })
  it('rate string numérica é coerc­ida', () => {
    expect(calculateCostSnapshot(60, '100')).toBe(100)
  })
})

describe('netDurationMinutes (parede-relógio menos pausas sobrepostas)', () => {
  const start = new Date('2026-07-10T09:00:00-03:00')
  const end = new Date('2026-07-10T18:00:00-03:00')

  it('sem pausa → 9h de parede', () => {
    expect(netDurationMinutes(start, end, [])).toBe(540)
  })

  it('1h de almoço → 8h líquidas', () => {
    expect(netDurationMinutes(start, end, [
      { paused_at: '2026-07-10T12:00:00-03:00', resumed_at: '2026-07-10T13:00:00-03:00' },
    ])).toBe(480)
  })

  it('pausa que sai da janela nova só desconta o overlap', () => {
    // Janela encolhida pra 09–12; a pausa 12–13 não entra.
    const noon = new Date('2026-07-10T12:00:00-03:00')
    expect(netDurationMinutes(start, noon, [
      { paused_at: '2026-07-10T12:00:00-03:00', resumed_at: '2026-07-10T13:00:00-03:00' },
    ])).toBe(180)
  })
})

describe('rateFromSnapshot (taxa vigente na época, não a de hoje)', () => {
  it('8h a R$800 → 100/h', () => {
    expect(rateFromSnapshot(480, 800)).toBe(100)
  })
  it('duração 0 ou custo vazio → fallback', () => {
    expect(rateFromSnapshot(0, 800, 50)).toBe(50)
    expect(rateFromSnapshot(60, null, 50)).toBe(50)
  })
})

describe('sameInstant', () => {
  it('ISO com fuso diferente, mesmo instante', () => {
    expect(sameInstant('2026-07-10T09:00:00-03:00', '2026-07-10T12:00:00Z')).toBe(true)
  })
  it('instantes distintos', () => {
    expect(sameInstant('2026-07-10T09:00:00-03:00', '2026-07-10T09:01:00-03:00')).toBe(false)
  })
})
