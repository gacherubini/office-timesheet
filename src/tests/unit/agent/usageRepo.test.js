import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { insert, resumoDoMes } from '../../../lib/agent/usageRepo.js'

describe('usageRepo', () => {
  let user
  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'admin' })
    process.env.AGENT_PRICE_IN = '0.14'; process.env.AGENT_PRICE_OUT = '0.28'; process.env.AGENT_PRICE_CACHED = '0.014'
  })

  it('grava uma linha de uso com custo calculado', async () => {
    await insert({ profile: user, model: 'deepseek-v4-flash', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const { rows } = await query('SELECT * FROM agent_usage')
    expect(rows).toHaveLength(1)
    expect(rows[0].model).toBe('deepseek-v4-flash')
    expect(Number(rows[0].custo_usd)).toBeCloseTo(0.14, 6)
    expect(rows[0].status).toBe('ok')
  })

  it('sem preço, custo_usd fica null', async () => {
    delete process.env.AGENT_PRICE_IN; delete process.env.AGENT_PRICE_OUT; delete process.env.AGENT_PRICE_CACHED
    await insert({ profile: user, model: 'x', tokensIn: 10, tokensOut: 5, cached: 0 })
    const { rows } = await query('SELECT custo_usd FROM agent_usage')
    expect(rows[0].custo_usd).toBeNull()
  })

  it('resumoDoMes agrega por dia e soma o total do mês', async () => {
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const r = await resumoDoMes()
    expect(r.porDia).toHaveLength(1)
    expect(r.porDia[0].tokensIn).toBe(2_000_000)
    expect(r.totalUsd).toBeCloseTo(0.28, 6)
  })
})
