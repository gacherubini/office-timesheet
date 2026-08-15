import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { ensureRoRole } from '../../helpers/roDb.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

// Fake que erra o SQL na 1ª volta, LÊ o erro real, conserta na 2ª, e responde na 3ª.
function fakeCorrigeSql() {
  const capturas = []
  let n = 0
  const call = (sql) => ({
    message: { role: 'assistant', tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'consultar_dados', arguments: JSON.stringify({ sql }) } }] },
    usage: {},
  })
  return {
    client: {
      async stream({ messages }) {
        capturas.push(messages)
        n += 1
        if (n === 1) return call('SELECT coluna_que_nao_existe FROM users')
        if (n === 2) return call('SELECT name FROM users ORDER BY name')
        return { message: { role: 'assistant', content: 'Os nomes são: Ana, Bruno, Chefe.' }, usage: {} }
      },
    },
    capturas,
  }
}

describe('SQL híbrido: esquema injetado + iteração sobre erro real', () => {
  let admin
  beforeAll(async () => { await ensureRoRole() })
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await makeUser({ role: 'employee', name: 'Ana' })
    await makeUser({ role: 'employee', name: 'Bruno' })
  })
  afterEach(() => resetClient())

  it('admin recebe o esquema no system prompt e o modelo corrige o SQL após o erro real', async () => {
    const { client, capturas } = fakeCorrigeSql()
    setClient(client)

    const res = await asUser(admin).post('/agent/chat').send({ message: 'liste os nomes das pessoas' })
    const eventos = readSse(res)

    // 1) esquema REAL injetado no system prompt (1ª chamada, 1ª mensagem = system).
    const system = capturas[0][0]
    expect(system.role).toBe('system')
    expect(system.content).toContain('cost_snapshot') // coluna real do esquema

    // 2) o erro REAL do SQL voltou AO MODELO (a 2ª chamada carrega a tool message com o detalhe).
    const toolMsg = capturas[1].find((m) => m.role === 'tool')
    expect(JSON.stringify(toolMsg)).toMatch(/coluna_que_nao_existe|does not exist/i)

    // 3) o modelo se corrigiu e chegou à resposta final (não travou, não caiu em fallback).
    const answer = eventos.find((e) => e.type === 'answer')
    expect(answer?.text).toMatch(/Ana|Bruno|Chefe/)
  })

  it('colaborador NÃO recebe o esquema no system prompt', async () => {
    const capturas = []
    setClient({ async stream({ messages }) { capturas.push(messages); return { message: { role: 'assistant', content: 'ok' }, usage: {} } } })
    const emp = await makeUser({ role: 'employee', name: 'Zé' })
    await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    expect(capturas[0][0].content).not.toContain('cost_snapshot')
    expect(capturas[0][0].content).not.toContain('# Esquema do banco')
  })
})
