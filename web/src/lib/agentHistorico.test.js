import { describe, it, expect } from 'vitest'
import { rotuloHora, agruparPorData } from './agentHistorico.js'

// Relógio fixo para os testes: 16/08/2026, 14:00.
const AGORA = new Date('2026-08-16T14:00:00')
const em = (iso) => new Date(iso).toISOString()

describe('rotuloHora', () => {
  it('menos de uma hora vira "agora"', () => {
    expect(rotuloHora(em('2026-08-16T13:20:00'), AGORA)).toBe('agora')
  })

  it('no mesmo dia conta horas decorridas', () => {
    expect(rotuloHora(em('2026-08-16T03:00:00'), AGORA)).toBe('11 h')
  })

  it('ontem mostra a hora do relógio — o grupo já diz o dia', () => {
    expect(rotuloHora(em('2026-08-15T18:40:00'), AGORA)).toBe('18:40')
  })

  it('mais antigo mostra dia e mês', () => {
    expect(rotuloHora(em('2026-08-08T09:00:00'), AGORA)).toBe('8 ago')
  })

  it('em outro ano o rótulo carrega o ano', () => {
    expect(rotuloHora(em('2025-12-02T09:00:00'), AGORA)).toBe('2 dez 2025')
  })

  it('data ausente ou inválida não quebra', () => {
    expect(rotuloHora(null, AGORA)).toBe('')
    expect(rotuloHora('nada disso', AGORA)).toBe('')
  })
})

describe('agruparPorData', () => {
  const items = [
    { id: 1, title: 'Quem não apontou esta semana?', last_message_at: em('2026-08-16T03:00:00') },
    { id: 2, title: 'Lançar um bônus', last_message_at: em('2026-08-16T02:00:00') },
    { id: 3, title: 'Aprovações pendentes', last_message_at: em('2026-08-15T18:40:00') },
    { id: 4, title: 'Custo do projeto', last_message_at: em('2026-08-12T10:00:00') },
    { id: 5, title: 'Fechar folha de julho', last_message_at: em('2026-07-30T10:00:00') },
  ]

  it('separa hoje, ontem, últimos 7 dias e mais antigas, nessa ordem', () => {
    const grupos = agruparPorData(items, AGORA)
    expect(grupos.map((g) => g.rotulo)).toEqual(['Hoje', 'Ontem', 'Últimos 7 dias', 'Mais antigas'])
    expect(grupos.map((g) => g.items.map((i) => i.id))).toEqual([[1, 2], [3], [4], [5]])
  })

  it('não cria grupo vazio', () => {
    const grupos = agruparPorData([items[0]], AGORA)
    expect(grupos.map((g) => g.rotulo)).toEqual(['Hoje'])
  })

  it('preserva a ordem que veio da API dentro do grupo', () => {
    const grupos = agruparPorData([items[1], items[0]], AGORA)
    expect(grupos[0].items.map((i) => i.id)).toEqual([2, 1])
  })

  it('lista vazia ou ausente devolve nenhum grupo', () => {
    expect(agruparPorData([], AGORA)).toEqual([])
    expect(agruparPorData(undefined, AGORA)).toEqual([])
  })

  it('conversa sem data cai em mais antigas em vez de sumir', () => {
    const grupos = agruparPorData([{ id: 9, title: 'Sem data', last_message_at: null }], AGORA)
    expect(grupos.map((g) => g.rotulo)).toEqual(['Mais antigas'])
    expect(grupos[0].items[0].id).toBe(9)
  })
})
