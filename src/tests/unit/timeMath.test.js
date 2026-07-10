import { describe, it, expect } from 'vitest'
import { calculateDurationMinutes, calculateCostSnapshot } from '../../lib/timeMath.js'

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
