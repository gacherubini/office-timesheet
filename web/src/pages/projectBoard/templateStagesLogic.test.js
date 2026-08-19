import { describe, it, expect } from 'vitest'
import { moverEtapa, removerEtapa, etapaDoCatalogoJaAdicionada } from './templateStagesLogic'

describe('moverEtapa', () => {
  it('troca duas etapas de posição', () => {
    const stages = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const { stages: novas } = moverEtapa(stages, [], 1, -1)
    expect(novas.map((s) => s.name)).toEqual(['B', 'A', 'C'])
  })

  it('não mexe se já está no topo', () => {
    const stages = [{ name: 'A' }, { name: 'B' }]
    const { stages: novas } = moverEtapa(stages, [], 0, -1)
    expect(novas).toBe(stages)
  })

  it('não mexe se já está no fim', () => {
    const stages = [{ name: 'A' }, { name: 'B' }]
    const { stages: novas } = moverEtapa(stages, [], 1, 1)
    expect(novas).toBe(stages)
  })

  // O ponto principal: a task continua na MESMA etapa (pelo conteúdo), não na
  // mesma posição numérica.
  it('task acompanha a etapa que se moveu', () => {
    const stages = [{ name: 'Anteprojeto' }, { name: 'Executivo' }]
    const items = [
      { title: 'Planta', stageIndex: 0 },
      { title: 'Detalhamento', stageIndex: 1 },
      { title: 'Solta', stageIndex: null },
    ]
    const { stages: novas, items: novosItems } = moverEtapa(stages, items, 0, 1)
    expect(novas.map((s) => s.name)).toEqual(['Executivo', 'Anteprojeto'])
    expect(novosItems.find((i) => i.title === 'Planta').stageIndex).toBe(1)
    expect(novosItems.find((i) => i.title === 'Detalhamento').stageIndex).toBe(0)
    expect(novosItems.find((i) => i.title === 'Solta').stageIndex).toBeNull()
  })
})

describe('removerEtapa', () => {
  it('remove a etapa do índice dado', () => {
    const stages = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const { stages: novas } = removerEtapa(stages, [], 1)
    expect(novas.map((s) => s.name)).toEqual(['A', 'C'])
  })

  it('task da etapa removida cai em "Sem etapa" (stageIndex null)', () => {
    const stages = [{ name: 'A' }, { name: 'B' }]
    const items = [{ title: 'X', stageIndex: 1 }]
    const { items: novosItems } = removerEtapa(stages, items, 1)
    expect(novosItems[0].stageIndex).toBeNull()
  })

  it('task de etapa POSTERIOR desliza o índice pra trás', () => {
    const stages = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const items = [{ title: 'X', stageIndex: 2 }]
    const { items: novosItems } = removerEtapa(stages, items, 0)
    expect(novosItems[0].stageIndex).toBe(1)
  })

  it('task de etapa ANTERIOR não muda', () => {
    const stages = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const items = [{ title: 'X', stageIndex: 0 }]
    const { items: novosItems } = removerEtapa(stages, items, 2)
    expect(novosItems[0].stageIndex).toBe(0)
  })

  it('task já "Sem etapa" continua sem etapa', () => {
    const stages = [{ name: 'A' }]
    const items = [{ title: 'X', stageIndex: null }]
    const { items: novosItems } = removerEtapa(stages, items, 0)
    expect(novosItems[0].stageIndex).toBeNull()
  })
})

describe('etapaDoCatalogoJaAdicionada', () => {
  it('true quando o catalog_id já está na lista', () => {
    const stages = [{ catalog_id: 'cat-1', name: 'Anteprojeto' }]
    expect(etapaDoCatalogoJaAdicionada(stages, 'cat-1')).toBe(true)
  })

  it('false quando não está', () => {
    const stages = [{ catalog_id: 'cat-1', name: 'Anteprojeto' }]
    expect(etapaDoCatalogoJaAdicionada(stages, 'cat-2')).toBe(false)
  })

  it('false pra etapa livre (catalog_id null) mesmo com nome parecido', () => {
    const stages = [{ catalog_id: null, name: 'Anteprojeto' }]
    expect(etapaDoCatalogoJaAdicionada(stages, 'cat-1')).toBe(false)
  })
})
