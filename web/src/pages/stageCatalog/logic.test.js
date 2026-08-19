import { describe, it, expect } from 'vitest'
import { ordenarPorPosicao, proximaPosicao, validarNome, moverPosicao } from './logic'

describe('ordenarPorPosicao', () => {
  it('ordena por position crescente', () => {
    const out = ordenarPorPosicao([{ name: 'B', position: 20 }, { name: 'A', position: 10 }])
    expect(out.map((i) => i.name)).toEqual(['A', 'B'])
  })

  it('empate de position desempata por nome (mesma regra do backend)', () => {
    const out = ordenarPorPosicao([{ name: 'Zeta', position: 10 }, { name: 'Alfa', position: 10 }])
    expect(out.map((i) => i.name)).toEqual(['Alfa', 'Zeta'])
  })

  it('não muda o array original (é puro)', () => {
    const original = [{ name: 'B', position: 20 }, { name: 'A', position: 10 }]
    ordenarPorPosicao(original)
    expect(original.map((i) => i.name)).toEqual(['B', 'A'])
  })
})

describe('proximaPosicao', () => {
  it('lista vazia começa em 10', () => {
    expect(proximaPosicao([])).toBe(10)
  })

  it('soma 10 à maior posição existente', () => {
    expect(proximaPosicao([{ position: 10 }, { position: 90 }])).toBe(100)
  })

  it('trata position ausente/não-inteiro como 0', () => {
    expect(proximaPosicao([{ position: null }, { position: 5 }])).toBe(15)
  })
})

describe('validarNome', () => {
  it('nome vazio é inválido', () => {
    expect(validarNome('')).toEqual({ valido: false, erro: 'Informe o nome da etapa.' })
  })

  it('nome só com espaços é inválido', () => {
    expect(validarNome('   ')).toEqual({ valido: false, erro: 'Informe o nome da etapa.' })
  })

  it('nome válido volta aparado', () => {
    expect(validarNome('  Anteprojeto  ')).toEqual({ valido: true, nome: 'Anteprojeto' })
  })
})

describe('moverPosicao', () => {
  const lista = [
    { id: 'a', name: 'A', position: 10 },
    { id: 'b', name: 'B', position: 20 },
    { id: 'c', name: 'C', position: 30 },
  ]

  it('subir troca a posição com o vizinho anterior', () => {
    const out = moverPosicao(lista, 1, -1)
    expect(out).toEqual([
      { id: 'b', name: 'B', position: 10 },
      { id: 'a', name: 'A', position: 20 },
    ])
  })

  it('descer troca a posição com o vizinho seguinte', () => {
    const out = moverPosicao(lista, 1, 1)
    expect(out).toEqual([
      { id: 'b', name: 'B', position: 30 },
      { id: 'c', name: 'C', position: 20 },
    ])
  })

  it('não deixa subir o primeiro item', () => {
    expect(moverPosicao(lista, 0, -1)).toBeNull()
  })

  it('não deixa descer o último item', () => {
    expect(moverPosicao(lista, 2, 1)).toBeNull()
  })
})
