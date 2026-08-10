import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

async function readSse(res) {
  return res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))
}

// Invariante de boa-formação (OpenAI-compatible): toda mensagem assistant com
// tool_calls precisa ter, mais adiante no array, uma resposta role:'tool' para
// CADA tool_call.id. Devolve a lista de tool_call_id órfãos (vazia = ok).
function orfaosDeToolCall(messages) {
  const orfaos = []
  messages.forEach((msg, i) => {
    if (msg.role !== 'assistant' || !msg.tool_calls) return
    for (const call of msg.tool_calls) {
      const respondido = messages
        .slice(i + 1)
        .some((m) => m.role === 'tool' && m.tool_call_id === call.id)
      if (!respondido) orfaos.push(call.id)
    }
  })
  return orfaos
}

// Cliente falso com 2 turnos: 1º propõe uma escrita; 2º captura o histórico que
// a rota manda ao modelo e responde texto simples (encerra o laço).
function fakeClientMultiturno() {
  let chamada = 0
  const capturado = { messages: null }
  const client = {
    async stream(params, onToken) {
      chamada++
      if (chamada === 1) {
        return {
          message: {
            role: 'assistant',
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'propor_encerrar_apontamento', arguments: '{}' } },
            ],
          },
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }
      }
      capturado.messages = params.messages
      if (onToken) onToken('pronto')
      return { message: { role: 'assistant', content: 'pronto' }, usage: { prompt_tokens: 5, completion_tokens: 3 } }
    },
  }
  return { client, capturado }
}

describe('multiturno após proposta de escrita (histórico bem-formado)', () => {
  let emp, project
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject({ name: 'Projeto Y' })
  })
  afterEach(() => resetClient())

  it('2º turno na mesma conversa: assistant com tool_calls não fica órfão no histórico', async () => {
    // Apontamento aberto para a proposta de encerrar ter o que descrever.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '30 minutes', 'running')`,
      [emp.id, project.id],
    )
    const { client, capturado } = fakeClientMultiturno()
    setClient(client)

    // 1º turno: gera a proposta e o conversation_id.
    const t1 = await asUser(emp).post('/agent/chat').send({ message: 'encerra meu apontamento' })
    const ev1 = await readSse(t1)
    const conversationId = ev1.find((e) => e.type === 'session')?.conversation_id
    expect(conversationId).toBeTruthy()
    expect(ev1.find((e) => e.type === 'proposal')).toBeTruthy()

    // 2º turno: MESMA conversa (reaproveita conversation_id). Aqui o cliente
    // captura exatamente o array messages que a rota reenvia ao provedor.
    const t2 = await asUser(emp)
      .post('/agent/chat')
      .send({ message: 'obrigado', conversation_id: conversationId })
    await readSse(t2)

    expect(capturado.messages, 'o 2º turno precisa ter chamado o modelo').toBeTruthy()
    const orfaos = orfaosDeToolCall(capturado.messages)
    expect(orfaos, `tool_call_id sem resposta role:'tool': ${orfaos.join(', ')}`).toEqual([])
  })
})
