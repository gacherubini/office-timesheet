import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { asUser } from '../helpers/api.js'
import { resetDb } from '../helpers/db.js'
import { makeUser } from '../helpers/factories.js'
import { insert } from '../../lib/agent/usageRepo.js'

const ENV = 'AGENT_DAILY_BUDGET_USD'

describe('POST /agent/chat — teto diário', () => {
  let user
  const anteriorTeto = process.env[ENV]
  const anteriorChave = process.env.AGENT_API_KEY

  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'admin' })
    process.env.AGENT_API_KEY = 'sk-teste'
    process.env.AGENT_PRICE_IN = '1'; process.env.AGENT_PRICE_OUT = '1'; process.env.AGENT_PRICE_CACHED = '0'
  })
  afterEach(() => {
    if (anteriorTeto === undefined) delete process.env[ENV]; else process.env[ENV] = anteriorTeto
    if (anteriorChave === undefined) delete process.env.AGENT_API_KEY; else process.env.AGENT_API_KEY = anteriorChave
  })

  it('quem estourou recebe 429 com code — e nunca chega ao modelo', async () => {
    process.env[ENV] = '0.5'
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0 }) // US$ 1,00
    const res = await asUser(user).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('limite_diario')
    expect(res.body.error).toMatch(/limite de uso/i)
  })

  it('a mensagem não fala em dólar nem em variável de ambiente', async () => {
    process.env[ENV] = '0'
    const res = await asUser(user).post('/agent/chat').send({ message: 'oi' })
    expect(res.body.error).not.toMatch(/usd|us\$|budget|AGENT_/i)
  })

  it('o gasto de outra pessoa não conta contra mim', async () => {
    process.env[ENV] = '0.5'
    const outro = await makeUser({ role: 'admin', email: 'outro@x.com' })
    await insert({ profile: outro, model: 'x', tokensIn: 5_000_000, tokensOut: 0 })
    const res = await asUser(user).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).not.toBe(429)
  })

  it('com o teto desligado, gasto alto não barra', async () => {
    process.env[ENV] = 'off'
    await insert({ profile: user, model: 'x', tokensIn: 9_000_000, tokensOut: 0 })
    const res = await asUser(user).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).not.toBe(429)
  })
})
