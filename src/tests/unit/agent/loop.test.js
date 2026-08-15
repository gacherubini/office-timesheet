import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import { clearTestSink } from '../../../lib/logger.js'
import * as proposals from '../../../lib/agent/proposals.js'

const admin = { id: 1, role: 'admin' }

// Cliente falso: cada chamada a stream() devolve o próximo passo roteirizado.
function fakeClient(steps) {
  let i = 0
  return {
    async stream(_params, onToken) {
      const step = steps[i++]
      if (step.token) onToken(step.token)
      return { message: step.message, usage: step.usage || { prompt_tokens: 10, completion_tokens: 5 } }
    },
  }
}

describe('loop — tool-calling agnóstico', () => {
  beforeEach(() => clearTestSink())

  it('executa uma tool de leitura e depois emite a resposta final (evento answer)', async () => {
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'listar_equipe', arguments: '{}' } }] } },
      { message: { role: 'assistant', content: 'Temos 1 pessoa.' } },
    ])
    const respostas = []
    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'quem está no time?' }],
      emit: (e) => e.type === 'answer' && respostas.push(e.text),
    })
    expect(res.status).toBe('done')
    // A resposta final sai num único evento 'answer'; o raciocínio das iterações
    // intermediárias (com tool_calls) NÃO é emitido.
    expect(respostas).toEqual(['Temos 1 pessoa.'])
    // houve uma mensagem role:'tool' no meio (resultado da leitura):
    expect(res.messages.some((m) => m.role === 'tool')).toBe(true)
  })

  it('resultado gigante de tool entra cortado no histórico', async () => {
    process.env.AGENT_MAX_TOOL_RESULT_CHARS = '100'
    // Cliente falso: 1ª iteração chama listar_equipe, 2ª responde texto.
    // Força resultado grande — o ponto do teste é o corte, não a tool.
    const toolMod = await import('../../../lib/agent/tools/read/listarEquipe.js')
    const spy = vi.spyOn(toolMod.default, 'run').mockResolvedValue({
      count: 500,
      data: Array.from({ length: 500 }, (_, i) => ({ nome: `pessoa ${i}` })),
    })
    let n = 0
    const client = {
      async stream() {
        n++
        if (n === 1) {
          return {
            message: {
              role: 'assistant',
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'listar_equipe', arguments: '{}' } }],
            },
            usage: {},
          }
        }
        return { message: { role: 'assistant', content: 'pronto' }, usage: {} }
      },
    }
    const messages = [{ role: 'user', content: 'quem está no time?' }]
    const { messages: full } = await runAgentTurn({
      client, profile: { id: 1, role: 'admin', name: 'A' }, model: 'x', messages, emit: () => {},
    })
    const resposta = full.find((m) => m.role === 'tool')
    expect(resposta.content.length).toBeLessThan(400)
    expect(resposta.content).toContain('resultado cortado')
    spy.mockRestore()
    delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
  })

  it('numa tool de escrita, emite proposta e pausa (awaiting_confirmation)', async () => {
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_encerrar_apontamento', arguments: '{}' } }] } },
    ])
    // A tool de escrita é chamada de verdade; isola-se só o propose:
    const eventos = []
    const spy = vi.spyOn(proposals, 'createProposal').mockReturnValue({ proposalId: 'p1' })
    const toolMod = await import('../../../lib/agent/tools/write/proporEncerrarApontamento.js')
    vi.spyOn(toolMod.default, 'propose').mockResolvedValue({
      kind: 'encerrar_apontamento', payload: { entry_id: 9 },
      descricao: 'Encerrar apontamento X', dados: { entry_id: 9 },
    })

    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'encerra meu apontamento' }],
      emit: (e) => eventos.push(e),
    })
    expect(res.status).toBe('awaiting_confirmation')
    const prop = eventos.find((e) => e.type === 'proposal')
    expect(prop.proposalId).toBe('p1')
    expect(prop.descricao).toMatch(/Encerrar apontamento/)
    spy.mockRestore()
  })

  it('tool de leitura com arquivo emite evento file e não coloca o token no histórico do modelo', async () => {
    const rel = await import('../../../lib/agent/tools/read/gerarRelatorio.js')
    const spy = vi.spyOn(rel.default, 'run').mockResolvedValue({
      data: { ok: true, filename: 'x.csv', formato: 'csv', secoes: [{ fonte: 'quem_nao_apontou', linhas: 1 }] },
      count: 1,
      arquivo: { token: 'tok-secreto', filename: 'x.csv', mime: 'text/csv', bytes: 12 },
    })
    const eventos = []
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'gerar_relatorio', arguments: '{"titulo":"X","formato":"csv","fontes":[{"tool":"quem_nao_apontou","params":{"periodo":"hoje"}}]}' } }] } },
      { message: { role: 'assistant', content: 'gerei o csv' } },
    ])
    const { messages } = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'me tira um csv' }],
      emit: (e) => eventos.push(e),
    })
    const fileEvt = eventos.find((e) => e.type === 'file')
    expect(fileEvt).toMatchObject({ token: 'tok-secreto', filename: 'x.csv', mime: 'text/csv', bytes: 12 })
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg.content).not.toContain('tok-secreto')
    expect(toolMsg.content).toContain('x.csv')
    spy.mockRestore()
  })
})
