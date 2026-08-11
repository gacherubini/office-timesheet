import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

function fakeToolCall(name, args = '{}') {
  let done = false
  return {
    async stream() {
      if (done) return { message: { role: 'assistant', content: 'ok' }, usage: {} }
      done = true
      return {
        message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] },
        usage: {},
      }
    },
  }
}
const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

describe('POST /agent/actions/:id/cancel', () => {
  let emp, project
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    project = await makeProject({ name: 'Projeto Z' })
  })
  afterEach(() => resetClient())

  async function proporApontamento() {
    setClient(fakeToolCall('propor_criar_apontamento', JSON.stringify({ projeto: 'Projeto Z' })))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'começa meu timer no Projeto Z' })
    const eventos = readSse(chat)
    return {
      proposalId: eventos.find((e) => e.type === 'proposal').proposalId,
      conversationId: eventos.find((e) => e.type === 'session').conversation_id,
    }
  }

  it('consome a proposta: depois de cancelar, executar dá 404', async () => {
    const { proposalId } = await proporApontamento()
    const cancel = await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})
    expect(cancel.status).toBe(200)
    expect(cancel.body.ok).toBe(true)

    const exec = await asUser(emp).post(`/agent/actions/${proposalId}/execute`).send({})
    expect(exec.status).toBe(404)
  })

  it('não executa a escrita — nenhum apontamento é criado', async () => {
    const { proposalId } = await proporApontamento()
    await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})
    const { rows } = await query('SELECT 1 FROM time_entries WHERE user_id = $1', [emp.id])
    expect(rows).toHaveLength(0)
  })

  it('o próximo turno sabe que foi cancelado (nota volta ao histórico)', async () => {
    const { proposalId, conversationId } = await proporApontamento()
    await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})

    // Próximo turno: captura o que a rota manda ao modelo.
    let enviadas = null
    setClient({
      async stream({ messages }) {
        enviadas = messages
        return { message: { role: 'assistant', content: 'entendi' }, usage: {} }
      },
    })
    await asUser(emp).post('/agent/chat').send({ message: 'e aí?', conversation_id: conversationId })
    const texto = enviadas.map((m) => m.content).join(' ')
    expect(texto).toContain('Cancelado')
  })

  it('proposta inexistente dá 404', async () => {
    const res = await asUser(emp).post('/agent/actions/nao-existe/cancel').send({})
    expect(res.status).toBe(404)
  })
})
