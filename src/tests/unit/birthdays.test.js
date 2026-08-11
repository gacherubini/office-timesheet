import { describe, it, expect } from 'vitest'
import { ehAniversario, aniversariantes } from '../../lib/birthdays.js'

describe('ehAniversario', () => {
  it('casa mês e dia, ignorando o ano de nascimento', () => {
    expect(ehAniversario('1990-03-15', '2026-03-15')).toBe(true)
    expect(ehAniversario('1990-03-15', '2026-03-16')).toBe(false)
    expect(ehAniversario('1990-04-15', '2026-03-15')).toBe(false)
  })

  it('aceita tanto string quanto Date', () => {
    expect(ehAniversario(new Date(1990, 2, 15), '2026-03-15')).toBe(true) // mês 2 = março
  })

  it('nascido em 29/02 comemora em 28/02 nos anos não-bissextos', () => {
    // "hoje" sempre vem de uma data real (dateInSaoPaulo), então em 2026 (não
    // bissexto) o dia é 28/02; em 2028 (bissexto), 29/02.
    expect(ehAniversario('2000-02-29', '2026-02-28')).toBe(true) // não bissexto → 28/02
    expect(ehAniversario('2000-02-29', '2028-02-29')).toBe(true) // bissexto → 29/02
    expect(ehAniversario('2000-02-29', '2028-02-28')).toBe(false) // no bissexto, só no dia 29
  })

  it('birth_date ausente nunca é aniversário', () => {
    expect(ehAniversario(null, '2026-03-15')).toBe(false)
    expect(ehAniversario('', '2026-03-15')).toBe(false)
  })
})

describe('aniversariantes', () => {
  const time = [
    { name: 'Bia', position: 'Designer', birth_date: '1990-03-15' },
    { name: 'Ana', position: 'Dev', birth_date: '1985-03-15' },
    { name: 'Caio', position: null, birth_date: '1992-07-01' },
    { name: 'Duda', position: 'PM', birth_date: null }, // sem data → nunca aparece
  ]

  it('sem mês: só quem faz aniversário hoje, ordenado por nome', () => {
    const r = aniversariantes(time, { hoje: '2026-03-15' })
    expect(r).toEqual([
      { nome: 'Ana', dia: 15, mes: 3, cargo: 'Dev' },
      { nome: 'Bia', dia: 15, mes: 3, cargo: 'Designer' },
    ])
  })

  it('nunca expõe o ano/idade no resultado', () => {
    const r = aniversariantes(time, { hoje: '2026-03-15' })
    for (const a of r) expect(Object.keys(a).sort()).toEqual(['cargo', 'dia', 'mes', 'nome'])
  })

  it('com mês: todos daquele mês, ordenados por dia', () => {
    const r = aniversariantes(time, { mes: 3 })
    expect(r.map((a) => a.nome)).toEqual(['Ana', 'Bia'])
    const julho = aniversariantes(time, { mes: 7 })
    expect(julho.map((a) => a.nome)).toEqual(['Caio'])
  })

  it('cargo vira null quando ausente', () => {
    const r = aniversariantes(time, { mes: 7 })
    expect(r[0]).toEqual({ nome: 'Caio', dia: 1, mes: 7, cargo: null })
  })

  it('lista vazia ou nula não quebra', () => {
    expect(aniversariantes([], { hoje: '2026-03-15' })).toEqual([])
    expect(aniversariantes(null, { hoje: '2026-03-15' })).toEqual([])
  })
})
