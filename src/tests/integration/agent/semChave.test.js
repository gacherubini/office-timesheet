import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'

// Sem AGENT_API_KEY o cliente é construído com uma chave-placeholder e a falha só
// aparece como erro de provedor no meio do stream. A rota tem que recusar antes.
describe('agente sem AGENT_API_KEY configurada', () => {
  let emp
  const original = process.env.AGENT_API_KEY
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_API_KEY
    else process.env.AGENT_API_KEY = original
  })

  it('/agent/chat responde 503 com mensagem genérica', async () => {
    delete process.env.AGENT_API_KEY
    const res = await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Assistente indisponível no momento.')
    // Não vaza o nome da variável para o usuário final.
    expect(res.body.error).not.toMatch(/AGENT_API_KEY/)
  })

  it('/agent/actions/:id/execute também responde 503', async () => {
    delete process.env.AGENT_API_KEY
    const res = await asUser(emp).post('/agent/actions/qualquer-id/execute').send({})
    expect(res.status).toBe(503)
  })

  it('com a chave presente a rota segue normal (400 por falta de message, não 503)', async () => {
    process.env.AGENT_API_KEY = 'chave-de-teste'
    const res = await asUser(emp).post('/agent/chat').send({})
    expect(res.status).toBe(400)
  })
})
