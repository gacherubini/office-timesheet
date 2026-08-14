import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'
import { testSink, clearTestSink } from '../../../lib/logger.js'

const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

// Primeira volta: o modelo chama a tool meta. Segunda volta: responde texto.
function fakeMetaEntãoTexto(args) {
  let done = false
  return {
    async stream() {
      if (done) return { message: { role: 'assistant', content: 'ainda não faço isso, anotei seu pedido' }, usage: {} }
      done = true
      return {
        message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'registrar_pedido_nao_atendido', arguments: args } }] },
        usage: {},
      }
    },
  }
}

describe('tool kind meta roda inline (sem proposta)', () => {
  let emp
  beforeEach(async () => { await resetDb(); clearTestSink(); emp = await makeUser({ role: 'employee' }) })
  afterEach(() => resetClient())

  it('executa a tool, grava o pedido e NÃO emite proposta', async () => {
    setClient(fakeMetaEntãoTexto(JSON.stringify({ descricao: 'exportar para Excel', texto_original: 'baixar em excel?' })))
    const res = await asUser(emp).post('/agent/chat').send({ message: 'exporta pra excel?' })
    const eventos = readSse(res)
    expect(eventos.find((e) => e.type === 'proposal')).toBeUndefined()
    expect([...testSink].find((l) => l.evt === 'agent_read' && l.tool === 'registrar_pedido_nao_atendido')).toBeUndefined()
    const { rows } = await query('SELECT descricao FROM agent_feature_requests')
    expect(rows).toHaveLength(1)
    expect(rows[0].descricao).toBe('exportar para Excel')
  })
})
