import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import * as usageRepo from '../../../lib/agent/usageRepo.js'

const admin = { id: 1, role: 'admin' }

// Cliente falso roteirizado: uma mensagem por iteração, na ordem.
function clienteComTurnos(turnos) {
  let i = 0
  return {
    async stream(_p, onDelta) {
      const message = turnos[i++]
      if (message.content) onDelta({ content: message.content })
      return { message, usage: { prompt_tokens: 1, completion_tokens: 1 } }
    },
  }
}

function chamada(nome, args) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: `c${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(args) } }],
  }
}

// Registry injetado: tools falsas de leitura, sem banco.
function registryFalso(tools) {
  return { definitions: [], get: (nome) => tools[nome] }
}

const leitura = (count) => ({ kind: 'read', run: async () => ({ data: [], count }) })

describe('loop — procedência da resposta', () => {
  beforeEach(() => { vi.spyOn(usageRepo, 'insert').mockResolvedValue() })
  afterEach(() => vi.restoreAllMocks())

  async function rodar(turnos, tools) {
    const eventos = []
    await runAgentTurn({
      client: clienteComTurnos(turnos),
      registry: registryFalso(tools),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    return eventos
  }

  it('emite as fontes de uma leitura junto com a resposta', async () => {
    const eventos = await rodar(
      [chamada('custo_por_projeto', { periodo: 'mes' }), { role: 'assistant', content: 'Custou R$ 42.310.' }],
      { custo_por_projeto: leitura(14) },
    )
    const fontes = eventos.find((e) => e.type === 'sources')
    expect(fontes.items).toEqual([{ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 }])
  })

  it('as fontes chegam antes da resposta — o rodapé não pode piscar depois', async () => {
    const eventos = await rodar(
      [chamada('custo_por_projeto', { periodo: 'mes' }), { role: 'assistant', content: 'ok' }],
      { custo_por_projeto: leitura(1) },
    )
    const iFontes = eventos.findIndex((e) => e.type === 'sources')
    const iAnswer = eventos.findIndex((e) => e.type === 'answer')
    expect(iFontes).toBeGreaterThanOrEqual(0)
    expect(iFontes).toBeLessThan(iAnswer)
  })

  it('sem leitura nenhuma não emite fontes — nada a declarar', async () => {
    const eventos = await rodar([{ role: 'assistant', content: 'Oi! Como posso ajudar?' }], {})
    expect(eventos.some((e) => e.type === 'sources')).toBe(false)
  })

  it('acumula leituras de iterações diferentes, na ordem em que rodaram', async () => {
    const eventos = await rodar(
      [
        chamada('listar_equipe', {}),
        chamada('custo_por_projeto', { periodo: 'semana' }),
        { role: 'assistant', content: 'Pronto.' },
      ],
      { listar_equipe: leitura(8), custo_por_projeto: leitura(3) },
    )
    expect(eventos.find((e) => e.type === 'sources').items.map((f) => f.rotulo))
      .toEqual(['Listar equipe', 'Custo por projeto'])
  })

  it('a mesma leitura repetida com os mesmos parâmetros aparece uma vez só', async () => {
    const eventos = await rodar(
      [
        chamada('listar_equipe', {}),
        chamada('listar_equipe', {}),
        { role: 'assistant', content: 'Pronto.' },
      ],
      { listar_equipe: leitura(8) },
    )
    expect(eventos.find((e) => e.type === 'sources').items).toHaveLength(1)
  })

  it('leitura que falhou não vira fonte — não lemos nada dali', async () => {
    const eventos = await rodar(
      [chamada('custo_por_projeto', { periodo: 'mes' }), { role: 'assistant', content: 'Não consegui.' }],
      { custo_por_projeto: { kind: 'read', run: async () => { throw new Error('banco fora') } } },
    )
    expect(eventos.some((e) => e.type === 'sources')).toBe(false)
  })
})
