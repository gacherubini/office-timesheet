import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'

describe('kill switch: AGENT_ENABLED desliga o backend do agente', () => {
  let emp
  const original = process.env.AGENT_ENABLED
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_ENABLED
    else process.env.AGENT_ENABLED = original
  })

  it('AGENT_ENABLED=false: /agent/chat responde 503', async () => {
    process.env.AGENT_ENABLED = 'false'
    const res = await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Assistente temporariamente desativado.')
  })

  it('AGENT_ENABLED=false: /agent/actions/:id/execute responde 503 (antes de tocar na proposta)', async () => {
    process.env.AGENT_ENABLED = 'false'
    const res = await asUser(emp).post('/agent/actions/qualquer-id/execute').send({})
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Assistente temporariamente desativado.')
  })

  it('AGENT_ENABLED ausente/true: a rota segue habilitada (não dá 503)', async () => {
    delete process.env.AGENT_ENABLED
    const res = await asUser(emp).post('/agent/chat').send({}) // sem message → 400, não 503
    expect(res.status).toBe(400)
  })
})
