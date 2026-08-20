import { describe, it, expect } from 'vitest'
import { ordenarPorPosicao, proximaPosicao, validarNome, reordenar } from './logic'

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

// `reordenar` é o caminho ÚNICO de reordenação: arrastar manda (de, para)
// arbitrários e o teclado manda (i, i±1). Um só código, um só conjunto de
// testes — antes eram duas setinhas trocando posição com o vizinho, que só
// sabiam mover uma casa por vez.
describe('reordenar', () => {
  const lista = [
    { id: 'a', name: 'A', position: 10 },
    { id: 'b', name: 'B', position: 20 },
    { id: 'c', name: 'C', position: 30 },
    { id: 'd', name: 'D', position: 40 },
  ]

  it('subir uma casa (o que a seta pra cima fazia) reordena e renumera', () => {
    const { lista: nova, alterados } = reordenar(lista, 2, 1)
    expect(nova.map((i) => i.name)).toEqual(['A', 'C', 'B', 'D'])
    expect(nova.map((i) => i.position)).toEqual([10, 20, 30, 40])
    expect(alterados).toEqual([
      { id: 'c', name: 'C', position: 20 },
      { id: 'b', name: 'B', position: 30 },
    ])
  })

  it('descer uma casa (o que a seta pra baixo fazia)', () => {
    const { lista: nova, alterados } = reordenar(lista, 0, 1)
    expect(nova.map((i) => i.name)).toEqual(['B', 'A', 'C', 'D'])
    expect(alterados.map((i) => [i.id, i.position])).toEqual([['b', 10], ['a', 20]])
  })

  it('arrastar do fim para o topo move várias casas de uma vez', () => {
    const { lista: nova, alterados } = reordenar(lista, 3, 0)
    expect(nova.map((i) => i.name)).toEqual(['D', 'A', 'B', 'C'])
    expect(nova.map((i) => i.position)).toEqual([10, 20, 30, 40])
    expect(alterados).toHaveLength(4)
  })

  it('arrastar do topo para o fim', () => {
    const { lista: nova } = reordenar(lista, 0, 3)
    expect(nova.map((i) => i.name)).toEqual(['B', 'C', 'D', 'A'])
    expect(nova.map((i) => i.position)).toEqual([10, 20, 30, 40])
  })

  it('só devolve em alterados quem realmente mudou de posição', () => {
    // C e D não saem do lugar: mandar PUT para eles seria escrita à toa.
    const { alterados } = reordenar(lista, 0, 1)
    expect(alterados.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('renumera em 10/20/30 mesmo quando as posições vinham bagunçadas', () => {
    const bagunçada = [
      { id: 'a', name: 'A', position: 0 },
      { id: 'b', name: 'B', position: 3 },
      { id: 'c', name: 'C', position: 7 },
    ]
    const { lista: nova, alterados } = reordenar(bagunçada, 2, 0)
    expect(nova.map((i) => [i.name, i.position])).toEqual([['C', 10], ['A', 20], ['B', 30]])
    expect(alterados).toHaveLength(3)
  })

  it('soltar no mesmo lugar não muda nada nem gera PUT', () => {
    const { lista: nova, alterados } = reordenar(lista, 2, 2)
    expect(nova.map((i) => i.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(alterados).toEqual([])
  })

  it('índice inválido (borda da lista no teclado) devolve a lista intacta', () => {
    // O teclado chama reordenar(0, -1) no primeiro item e (n-1, n) no último:
    // é assim que a borda vira no-op sem a tela precisar saber onde está.
    expect(reordenar(lista, 0, -1).alterados).toEqual([])
    expect(reordenar(lista, 3, 4).alterados).toEqual([])
    expect(reordenar(lista, 9, 0).alterados).toEqual([])
    expect(reordenar(lista, 0, -1).lista.map((i) => i.name)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('não muda o array original nem os itens dele (é puro)', () => {
    const original = lista.map((i) => ({ ...i }))
    reordenar(original, 3, 0)
    expect(original.map((i) => [i.name, i.position])).toEqual([['A', 10], ['B', 20], ['C', 30], ['D', 40]])
  })

  it('lista vazia não quebra', () => {
    expect(reordenar([], 0, 0)).toEqual({ lista: [], alterados: [] })
  })
})
