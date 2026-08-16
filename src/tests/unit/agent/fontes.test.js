import { describe, it, expect } from 'vitest'
import { rotuloDaTool, descreverFonte, ROTULOS } from '../../../lib/agent/fontes.js'
import { TODAS } from '../../../lib/agent/tools/catalog.js'

describe('rotuloDaTool', () => {
  it('usa o rótulo escrito à mão, com acento', () => {
    expect(rotuloDaTool('ferias_e_conflitos')).toBe('Férias e conflitos')
    expect(rotuloDaTool('custo_por_projeto')).toBe('Custo por projeto')
  })

  it('deriva um rótulo legível para tool sem entrada no mapa', () => {
    expect(rotuloDaTool('alguma_coisa_nova')).toBe('Alguma coisa nova')
  })

  it('não quebra com nome vazio', () => {
    expect(rotuloDaTool('')).toBe('')
    expect(rotuloDaTool(undefined)).toBe('')
  })
})

// Esta é a trava: se alguém adicionar uma tool de leitura e esquecer o rótulo,
// o teste cobra — em vez de a procedência aparecer sem acento na cara do usuário.
describe('cobertura do mapa de rótulos', () => {
  it('toda tool de leitura tem rótulo escrito à mão', () => {
    const semRotulo = TODAS
      .filter((t) => t.kind === 'read')
      .map((t) => t.definition.function.name)
      .filter((nome) => !ROTULOS[nome])
    expect(semRotulo).toEqual([])
  })
})

describe('descreverFonte', () => {
  it('traduz o período para algo que se lê em voz alta', () => {
    expect(descreverFonte({ tool: 'custo_por_projeto', params: { periodo: 'mes' }, count: 14 }))
      .toEqual({ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 })
    expect(descreverFonte({ tool: 'custo_por_projeto', params: { periodo: 'semana' }, count: 3 }).detalhe)
      .toBe('esta semana')
    expect(descreverFonte({ tool: 'custo_por_projeto', params: { periodo: 'hoje' }, count: 1 }).detalhe)
      .toBe('hoje')
  })

  it('sem parâmetro nenhum o detalhe fica vazio', () => {
    expect(descreverFonte({ tool: 'listar_equipe', params: {}, count: 8 }))
      .toEqual({ rotulo: 'Listar equipe', detalhe: '', count: 8 })
  })

  it('outros parâmetros viram chave: valor, ignorando vazios', () => {
    const f = descreverFonte({
      tool: 'status_projeto',
      params: { projeto: 'Aurora', incluir_arquivados: null, limite: 5 },
      count: 2,
    })
    expect(f.detalhe).toBe('projeto: Aurora · limite: 5')
  })

  it('período vem sempre primeiro, mesmo declarado por último', () => {
    const f = descreverFonte({ tool: 'bonus_do_periodo', params: { pessoa: 'Ana', periodo: 'mes' }, count: 4 })
    expect(f.detalhe).toBe('este mês · pessoa: Ana')
  })

  it('valor longo é cortado para não estourar o rodapé', () => {
    const f = descreverFonte({ tool: 'consultar_dados', params: { sql: 'SELECT '.repeat(40) }, count: 9 })
    expect(f.detalhe.length).toBeLessThanOrEqual(70)
    expect(f.detalhe.endsWith('…')).toBe(true)
  })

  it('count ausente vira null em vez de zero — não sabemos não é nenhum', () => {
    expect(descreverFonte({ tool: 'listar_equipe', params: {} }).count).toBeNull()
  })
})
