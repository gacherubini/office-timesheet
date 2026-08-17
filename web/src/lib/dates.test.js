// O bug que originou este arquivo: bônus gravado em 2026-08-17 aparecia como
// 16/08/2026 no relatório. Fixa o fuso para o do estúdio — em UTC o bug some e
// o teste passaria à toa.
process.env.TZ = 'America/Sao_Paulo'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateBR, todayInSaoPaulo } from './dates'

describe('formatDateBR', () => {
  it('data pura NÃO escorrega um dia em São Paulo', () => {
    // new Date('2026-08-17') é meia-noite UTC = 16/08 21h em BRT.
    expect(formatDateBR('2026-08-17')).toBe('17/08/2026')
  })

  it('vira o mês e o ano sem perder o dia', () => {
    expect(formatDateBR('2026-01-01')).toBe('01/01/2026')
    expect(formatDateBR('2025-12-31')).toBe('31/12/2025')
  })

  it('aceita timestamp ISO e mostra o dia local', () => {
    // 17/08 00:30 UTC ainda é 16/08 21:30 em São Paulo.
    expect(formatDateBR('2026-08-17T00:30:00.000Z')).toBe('16/08/2026')
    expect(formatDateBR('2026-08-17T12:00:00.000Z')).toBe('17/08/2026')
  })

  it('aceita Date e formata no fuso local', () => {
    expect(formatDateBR(new Date('2026-08-17T12:00:00.000Z'))).toBe('17/08/2026')
  })

  it('sem valor devolve o traço (ou o vazio pedido)', () => {
    expect(formatDateBR(null)).toBe('-')
    expect(formatDateBR('')).toBe('-')
    expect(formatDateBR(undefined, '')).toBe('')
  })
})

describe('todayInSaoPaulo', () => {
  afterEach(() => vi.useRealTimers())

  it('à noite em BRT ainda é hoje, não amanhã', () => {
    // 22h de 17/08 em São Paulo = 18/08 01:00 UTC. toISOString diria 18.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T01:00:00.000Z'))
    expect(todayInSaoPaulo()).toBe('2026-08-17')
  })

  it('de madrugada em UTC já é o mesmo dia de BRT', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T15:00:00.000Z'))
    expect(todayInSaoPaulo()).toBe('2026-08-17')
  })
})
