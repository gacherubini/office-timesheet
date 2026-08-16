import { describe, it, expect } from 'vitest'
import { CASES } from '../../../lib/agent/evals/cases.js'
import { CHECADORES, SANIDADE, PAPEIS_VALIDOS } from '../../../lib/agent/evals/criterios.js'

// Estes testes NÃO chamam o modelo — são baratos e rodam no CI normal. O que
// eles protegem é a coisa mais fácil de quebrar em silêncio: um caso com
// critério que ninguém checa passa a dar sensação de cobertura sem cobrir nada,
// e um checador quebrado reprova (ou aprova) tudo sem que ninguém perceba.

describe('forma dos casos de eval', () => {
  it('há casos', () => {
    expect(CASES.length).toBeGreaterThan(0)
  })

  it('todo caso tem nome, e nome não se repete', () => {
    const nomes = CASES.map((c) => c.nome)
    expect(nomes.every((n) => typeof n === 'string' && n.trim())).toBe(true)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  it('todo caso tem papel válido', () => {
    const invalidos = CASES.filter((c) => !PAPEIS_VALIDOS.includes(c.papel)).map((c) => c.nome)
    expect(invalidos).toEqual([])
  })

  it('todo caso tem pergunta em texto', () => {
    const vazios = CASES.filter((c) => typeof c.pergunta !== 'string' || !c.pergunta.trim()).map((c) => c.nome)
    expect(vazios).toEqual([])
  })

  it('todo caso declara ao menos uma expectativa', () => {
    const sem = CASES.filter((c) => !c.espera || Object.keys(c.espera).length === 0).map((c) => c.nome)
    expect(sem).toEqual([])
  })

  // A trava principal: critério sem checador vira falha silenciosa de cobertura.
  it('todo critério declarado tem checador no runner', () => {
    const orfaos = []
    for (const c of CASES) {
      for (const criterio of Object.keys(c.espera)) {
        if (!CHECADORES[criterio]) orfaos.push(`${c.nome} → ${criterio}`)
      }
    }
    expect(orfaos).toEqual([])
  })

  it('critérios de lista recebem lista não vazia', () => {
    const ruins = []
    for (const c of CASES) {
      for (const nome of ['naoAlcanca', 'toolEntre']) {
        if (!(nome in c.espera)) continue
        const v = c.espera[nome]
        if (!Array.isArray(v) || v.length === 0) ruins.push(`${c.nome} → ${nome}`)
      }
    }
    expect(ruins).toEqual([])
  })
})

// ── Checadores de sanidade: os que pegam os modos de falha de 2026-08-11 ──
// Sem estes testes, um regex errado deixaria a degeneração passar de novo — que
// é exatamente o problema que a sanidade existe para resolver.

function sanidade(nome) {
  const par = SANIDADE.find(([n]) => n === nome)
  if (!par) throw new Error(`checador de sanidade "${nome}" não existe`)
  return par[1]
}

const ctx = (texto, tools = ['listar_equipe']) => ({ texto, tools })

describe('sanidade: marcação de raciocínio', () => {
  const checa = sanidade('semMarcacaoDeRaciocinio')

  it('pega </think> cru no meio do texto', () => {
    expect(checa(ctx('Deixa eu pensar</think>A equipe tem 8 pessoas.'))).toMatch(/raciocínio/i)
  })

  it('pega marcador de canal do provedor', () => {
    expect(checa(ctx('<|channel|>análise'))).toBeTruthy()
    expect(checa(ctx('assistantfinal a equipe tem 8'))).toBeTruthy()
  })

  it('não reprova resposta limpa', () => {
    expect(checa(ctx('A equipe tem 8 pessoas hoje.'))).toBeNull()
  })
})

describe('sanidade: lixo do provedor', () => {
  const checa = sanidade('semLixoDeProvedor')

  it('pega página de erro devolvida como resposta', () => {
    expect(checa(ctx('<!DOCTYPE html><html><head><title>404 Not Found</title>'))).toBeTruthy()
  })

  it('não reprova prosa que fala de HTML', () => {
    expect(checa(ctx('Posso exportar o relatório em PDF ou planilha.'))).toBeNull()
  })
})

describe('sanidade: idioma', () => {
  const checa = sanidade('emPortugues')

  it('pega trecho em chinês', () => {
    expect(checa(ctx('A equipe tem 8 pessoas 好的'))).toMatch(/CJK|idioma/i)
  })

  it('pega trecho em cirílico', () => {
    expect(checa(ctx('A equipe tem 8 pessoas привет'))).toMatch(/idioma/i)
  })

  it('não reprova português com acento', () => {
    expect(checa(ctx('Há três férias em conflito no período — confirme a data.'))).toBeNull()
  })

  it('não reprova inglês solto, que é comum em nome de projeto', () => {
    expect(checa(ctx('O projeto Alpha Sprint Review está com 4 tarefas.'))).toBeNull()
  })
})

describe('sanidade: loop de repetição', () => {
  const checa = sanidade('semLoopDeRepeticao')

  it('pega a mesma frase longa repetida três vezes', () => {
    const f = 'O custo dos horistas no mês foi calculado a partir dos apontamentos'
    expect(checa(ctx(`${f}. ${f}. ${f}.`))).toMatch(/repetiu/i)
  })

  it('não reprova repetição curta legítima (itens de lista)', () => {
    expect(checa(ctx('Ana: 8h\nJoão: 8h\nMaria: 8h'))).toBeNull()
  })

  it('não reprova a mesma frase aparecendo duas vezes', () => {
    const f = 'O custo dos horistas no mês foi calculado a partir dos apontamentos'
    expect(checa(ctx(`${f}. ${f}.`))).toBeNull()
  })
})

describe('sanidade: turno vazio', () => {
  const checa = sanidade('naoVeioVazio')

  it('sem texto e sem tool é degenerado', () => {
    expect(checa({ texto: '', tools: [] })).toMatch(/vazio/i)
  })

  it('sem texto mas com tool é legítimo — na escrita, a proposta é a resposta', () => {
    expect(checa({ texto: '', tools: ['propor_criar_task'] })).toBeNull()
  })
})

describe('checadores declarados', () => {
  it('naoAlcanca reprova quando a tool proibida foi chamada', () => {
    const r = CHECADORES.naoAlcanca(['custo_por_projeto'], { tools: ['custo_por_projeto'] })
    expect(r).toMatch(/fora do papel/i)
  })

  it('naoAlcanca aceita caminho que usou só tools permitidas', () => {
    const r = CHECADORES.naoAlcanca(['custo_por_projeto'], { tools: ['registrar_pedido_nao_atendido'] })
    expect(r).toBeNull()
  })

  it('toolEntre aceita qualquer uma das alternativas', () => {
    expect(CHECADORES.toolEntre(['status_projeto', 'custo_por_projeto'], { tools: ['custo_por_projeto'] })).toBeNull()
    expect(CHECADORES.toolEntre(['status_projeto'], { tools: [] })).toMatch(/esperava uma de/i)
  })

  it('naoInventar só acusa quando não houve consulta nenhuma', () => {
    expect(CHECADORES.naoInventar(true, { tools: [], texto: 'O custo foi R$ 42.310.' })).toMatch(/número/i)
    expect(CHECADORES.naoInventar(true, { tools: ['custo_por_projeto'], texto: 'O custo foi R$ 42.310.' })).toBeNull()
  })
})
