import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import * as usageRepo from '../../../lib/agent/usageRepo.js'

const admin = { id: 1, role: 'admin' }

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
    tool_calls: [{ id: 'c1', type: 'function', function: { name: nome, arguments: JSON.stringify(args) } }],
  }
}

const SCHEMA_PERIODO = {
  type: 'object',
  properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
  additionalProperties: false,
}

function registryFalso(tools) {
  return { definitions: [], get: (nome) => tools[nome] }
}

describe('loop — argumentos de tool validados contra o schema', () => {
  beforeEach(() => { vi.spyOn(usageRepo, 'insert').mockResolvedValue() })
  afterEach(() => vi.restoreAllMocks())

  async function rodar(turnos, tools) {
    const eventos = []
    const { messages } = await runAgentTurn({
      client: clienteComTurnos(turnos),
      registry: registryFalso(tools),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    return { eventos, messages }
  }

  it('leitura com campo não declarado não roda, e o modelo recebe o porquê', async () => {
    let rodou = false
    const { messages } = await rodar(
      [chamada('custo_por_projeto', { periodo: 'mes', user_id: 'de-outra-pessoa' }),
       { role: 'assistant', content: 'Não consegui.' }],
      {
        custo_por_projeto: {
          kind: 'read',
          definition: { function: { name: 'custo_por_projeto', parameters: SCHEMA_PERIODO } },
          run: async () => { rodou = true; return { data: [], count: 0 } },
        },
      },
    )
    expect(rodou).toBe(false)
    const resultado = messages.find((m) => m.role === 'tool')
    expect(resultado.content).toMatch(/user_id/)
  })

  // A que mais importa: numa injeção, é o propose de escrita que causa estrago.
  it('escrita com argumento inválido nem chega ao propose', async () => {
    let propos = false
    const { eventos } = await rodar(
      [chamada('propor_lancar_bonus', { valor: 'quinhentos' }),
       { role: 'assistant', content: 'Não deu.' }],
      {
        propor_lancar_bonus: {
          kind: 'write',
          definition: {
            function: {
              name: 'propor_lancar_bonus',
              parameters: { type: 'object', properties: { valor: { type: 'number' } }, additionalProperties: false },
            },
          },
          propose: async () => { propos = true; return {} },
        },
      },
    )
    expect(propos).toBe(false)
    expect(eventos.some((e) => e.type === 'proposal')).toBe(false)
  })

  it('argumento válido continua rodando normalmente', async () => {
    let rodou = false
    await rodar(
      [chamada('custo_por_projeto', { periodo: 'mes' }), { role: 'assistant', content: 'ok' }],
      {
        custo_por_projeto: {
          kind: 'read',
          definition: { function: { name: 'custo_por_projeto', parameters: SCHEMA_PERIODO } },
          run: async () => { rodou = true; return { data: [], count: 1 } },
        },
      },
    )
    expect(rodou).toBe(true)
  })

  it('tool recusada não vira fonte — não leu nada', async () => {
    const { eventos } = await rodar(
      [chamada('custo_por_projeto', { periodo: 'ontem' }), { role: 'assistant', content: 'Não deu.' }],
      {
        custo_por_projeto: {
          kind: 'read',
          definition: { function: { name: 'custo_por_projeto', parameters: SCHEMA_PERIODO } },
          run: async () => ({ data: [], count: 3 }),
        },
      },
    )
    expect(eventos.some((e) => e.type === 'sources')).toBe(false)
  })

  it('o histórico fica bem-formado: todo tool_call recusado ganha resposta', async () => {
    const { messages } = await rodar(
      [chamada('custo_por_projeto', { periodo: 'ontem' }), { role: 'assistant', content: 'Não deu.' }],
      {
        custo_por_projeto: {
          kind: 'read',
          definition: { function: { name: 'custo_por_projeto', parameters: SCHEMA_PERIODO } },
          run: async () => ({ data: [], count: 0 }),
        },
      },
    )
    const calls = messages.filter((m) => m.role === 'assistant' && m.tool_calls).flatMap((m) => m.tool_calls)
    for (const c of calls) {
      expect(messages.some((m) => m.role === 'tool' && m.tool_call_id === c.id)).toBe(true)
    }
  })

  it('tool sem schema declarado continua rodando — não inventamos exigência', async () => {
    let rodou = false
    await rodar(
      [chamada('meta_qualquer', { o: 'que', vier: 1 }), { role: 'assistant', content: 'ok' }],
      { meta_qualquer: { kind: 'meta', definition: { function: { name: 'meta_qualquer' } }, run: async () => { rodou = true; return {} } } },
    )
    expect(rodou).toBe(true)
  })
})

// Segunda camada: não afirmamos ter detectado "má intenção" — isso seria
// alegação que não sabemos sustentar. Afirmamos um fato verificável: conteúdo
// de terceiro estava no contexto quando esta escrita foi proposta. Quem
// confirma decide com essa informação na tela.
describe('loop — proposta nascida em turno com anexo é sinalizada', () => {
  beforeEach(() => { vi.spyOn(usageRepo, 'insert').mockResolvedValue() })
  afterEach(() => vi.restoreAllMocks())

  const toolEscrita = {
    propor_criar_task: {
      kind: 'write',
      definition: { function: { name: 'propor_criar_task', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
      propose: async () => ({ descricao: 'Criar tarefa X', dados: { titulo: 'X' }, kind: 'criar_task', payload: {} }),
    },
  }

  async function propor({ anexoBruto }) {
    const eventos = []
    await runAgentTurn({
      client: clienteComTurnos([chamada('propor_criar_task', {})]),
      registry: registryFalso(toolEscrita),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
      anexoBruto,
    })
    return eventos.find((e) => e.type === 'proposal')
  }

  it('com anexo no turno, a proposta avisa', async () => {
    const p = await propor({ anexoBruto: { buffer: Buffer.from('x'), mimetype: 'text/plain', filename: 'brief.txt' } })
    expect(p.comAnexo).toBe(true)
  })

  it('sem anexo, não avisa — aviso que aparece sempre não avisa nada', async () => {
    const p = await propor({ anexoBruto: null })
    expect(p.comAnexo).toBe(false)
  })
})
