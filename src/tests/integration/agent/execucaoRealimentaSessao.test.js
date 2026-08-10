import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

async function readSse(res) {
  return res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))
}

// Invariante de boa-formação: toda mensagem assistant com tool_calls precisa ter,
// adiante no array, uma resposta role:'tool' para CADA tool_call.id.
function orfaosDeToolCall(messages) {
  const orfaos = []
  messages.forEach((msg, i) => {
    if (msg.role !== 'assistant' || !msg.tool_calls) return
    for (const call of msg.tool_calls) {
      const respondido = messages.slice(i + 1).some((m) => m.role === 'tool' && m.tool_call_id === call.id)
      if (!respondido) orfaos.push(call.id)
    }
  })
  return orfaos
}

// 1º turno: propõe encerrar. 2º turno: captura o histórico que a rota reenvia ao
// modelo e responde texto simples.
function fakeClientMultiturno() {
  let chamada = 0
  const capturado = { messages: null }
  const client = {
    async stream(params, onToken) {
      chamada++
      if (chamada === 1) {
        return {
          message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_encerrar_apontamento', arguments: '{}' } }] },
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }
      }
      capturado.messages = params.messages
      if (onToken) onToken('ok')
      return { message: { role: 'assistant', content: 'ok' }, usage: { prompt_tokens: 5, completion_tokens: 3 } }
    },
  }
  return { client, capturado }
}

describe('execute realimenta a sessão (nota de execução server-side)', () => {
  let emp, project
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject({ name: 'Projeto Y' })
  })
  afterEach(() => resetClient())

  it('propor → executar → 2ª mensagem: o histórico reenviado traz a nota de execução e continua bem-formado', async () => {
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '30 minutes', 'running')`,
      [emp.id, project.id],
    )
    const { client, capturado } = fakeClientMultiturno()
    setClient(client)

    // 1º turno: proposta + conversation_id.
    const t1 = await asUser(emp).post('/agent/chat').send({ message: 'encerra meu apontamento' })
    const ev1 = await readSse(t1)
    const conversationId = ev1.find((e) => e.type === 'session')?.conversation_id
    const prop = ev1.find((e) => e.type === 'proposal')
    expect(conversationId).toBeTruthy()
    expect(prop?.proposalId).toBeTruthy()

    // Executa a escrita de verdade.
    const exec = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(200)
    expect(exec.body.resultado.status).toBe('completed')

    // 2º turno na MESMA conversa: o modelo recebe o histórico já com a nota.
    const t2 = await asUser(emp).post('/agent/chat').send({ message: 'e agora?', conversation_id: conversationId })
    await readSse(t2)

    expect(capturado.messages, 'o 2º turno precisa ter chamado o modelo').toBeTruthy()
    // Existe uma mensagem assistant textual dizendo que a ação foi executada.
    const nota = capturado.messages.find((m) => m.role === 'assistant' && typeof m.content === 'string' && /Executado/i.test(m.content))
    expect(nota, 'a nota de execução precisa estar no histórico reenviado').toBeTruthy()
    expect(nota.content).toMatch(/completed/)
    // E o histórico continua sem tool_call órfão.
    expect(orfaosDeToolCall(capturado.messages)).toEqual([])
  })
})
