import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import { clearTestSink } from '../../../lib/logger.js'
import * as proposals from '../../../lib/agent/proposals.js'
import * as usageRepo from '../../../lib/agent/usageRepo.js'

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
  beforeEach(() => {
    clearTestSink()
    vi.spyOn(usageRepo, 'insert').mockResolvedValue()
  })
  afterEach(() => vi.restoreAllMocks())

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

  it('agenda_do_periodo envia conectado e calendar_error no role tool sem arquivo', async () => {
    const agenda = await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')
    const spy = vi.spyOn(agenda.default, 'run').mockResolvedValue({
      data: [], count: 0, conectado: false, calendar_error: true,
    })
    const eventos = []
    const client = fakeClient([
      { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'agenda_do_periodo', arguments: '{}' } }] } },
      { message: { role: 'assistant', content: 'sua agenda não está ligada' } },
    ])
    const { messages } = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'o que tenho hoje?' }],
      emit: (e) => eventos.push(e),
    })
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg.content).toContain('"conectado":false')
    expect(toolMsg.content).toContain('"calendar_error":true')
    expect(toolMsg.content).not.toContain('arquivo')
    expect(eventos.some((e) => e.type === 'file')).toBe(false)
    spy.mockRestore()
  })

  it('turno vazio: tenta de novo com um empurrão e entrega a resposta do retry', async () => {
    const visto = []
    const client = {
      async stream({ messages }) {
        visto.push(messages)
        if (visto.length === 1) return { message: { role: 'assistant', content: null }, usage: {} }
        return { message: { role: 'assistant', content: 'Você não quis dizer todas as tarefas?' }, usage: {} }
      },
    }
    const eventos = []
    const { messages } = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'e outro com todfa starefas' }],
      emit: (e) => eventos.push(e),
    })
    expect(visto).toHaveLength(2)
    const nudge = visto[1].find((m) => m.role === 'system' && /digitação|quis dizer/i.test(m.content || ''))
    expect(nudge).toBeTruthy()
    expect(messages.some((m) => m === nudge || (m.role === 'system' && /digitação|quis dizer/i.test(m.content || '')))).toBe(false)
    const malformada = messages.find((m) => m.role === 'assistant' && !m.content && !(m.tool_calls?.length))
    expect(malformada).toBeUndefined()
    expect(eventos.find((e) => e.type === 'answer')?.text).toBe('Você não quis dizer todas as tarefas?')
  })

  it('dois turnos vazios: fallback pede confirmação, sem "não consegui gerar"', async () => {
    const client = fakeClient([
      { message: { role: 'assistant', content: null } },
      { message: { role: 'assistant', content: '' } },
    ])
    const eventos = []
    await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'todfa starefas' }],
      emit: (e) => eventos.push(e),
    })
    const texto = eventos.find((e) => e.type === 'answer')?.text || ''
    expect(texto).toMatch(/não entendi/i)
    expect(texto).toMatch(/confirma/i)
    expect(texto).not.toMatch(/não consegui gerar uma resposta agora/i)
  })

  it('várias tools com arquivo emitem um evento file cada', async () => {
    const rel = await import('../../../lib/agent/tools/read/gerarRelatorio.js')
    const spy = vi.spyOn(rel.default, 'run')
      .mockResolvedValueOnce({
        data: { ok: true, filename: 'a.csv', formato: 'csv' },
        count: 1,
        arquivo: { token: 't1', filename: 'a.csv', mime: 'text/csv', bytes: 2 },
      })
      .mockResolvedValueOnce({
        data: { ok: true, filename: 'a.pdf', formato: 'pdf' },
        count: 1,
        arquivo: { token: 't2', filename: 'a.pdf', mime: 'application/pdf', bytes: 4 },
      })
    const eventos = []
    await runAgentTurn({
      client: fakeClient([
        {
          message: {
            role: 'assistant',
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'gerar_relatorio', arguments: '{"titulo":"A","formato":"csv","fontes":[{"tool":"quem_nao_apontou","params":{}}]}' } },
              { id: 'c2', type: 'function', function: { name: 'gerar_relatorio', arguments: '{"titulo":"A","formato":"pdf","fontes":[{"tool":"quem_nao_apontou","params":{}}]}' } },
            ],
          },
        },
        { message: { role: 'assistant', content: 'gerei os dois' } },
      ]),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'os dois formatos' }],
      emit: (e) => eventos.push(e),
    })
    const files = eventos.filter((e) => e.type === 'file')
    expect(files).toHaveLength(2)
    expect(files.map((f) => f.filename)).toEqual(['a.csv', 'a.pdf'])
    spy.mockRestore()
  })

  it('result.arquivos emite um file por item', async () => {
    const rel = await import('../../../lib/agent/tools/read/gerarRelatorio.js')
    const spy = vi.spyOn(rel.default, 'run').mockResolvedValue({
      data: { ok: true, arquivos: [{ filename: 'a.csv', formato: 'csv' }, { filename: 'a.md', formato: 'md' }] },
      count: 2,
      arquivos: [
        { token: 't1', filename: 'a.csv', mime: 'text/csv', bytes: 2 },
        { token: 't2', filename: 'a.md', mime: 'text/markdown', bytes: 3 },
      ],
    })
    const eventos = []
    await runAgentTurn({
      client: fakeClient([
        { message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'gerar_relatorio', arguments: '{"titulo":"A","formatos":["csv","md"],"fontes":[{"tool":"quem_nao_apontou","params":{}}]}' } }] } },
        { message: { role: 'assistant', content: 'gerei' } },
      ]),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'csv e md' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'file')).toEqual([
      { type: 'file', token: 't1', filename: 'a.csv', mime: 'text/csv', bytes: 2 },
      { type: 'file', token: 't2', filename: 'a.md', mime: 'text/markdown', bytes: 3 },
    ])
    spy.mockRestore()
  })
})
