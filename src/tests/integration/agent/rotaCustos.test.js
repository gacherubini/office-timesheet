import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { insert } from '../../../lib/agent/usageRepo.js'

describe('GET /admin/agent/costs', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee' })
    process.env.AGENT_API_KEY = 'sk-x'
    process.env.AGENT_PRICE_IN = '0.14'; process.env.AGENT_PRICE_OUT = '0.28'; process.env.AGENT_PRICE_CACHED = '0.014'
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('403 para não-admin', async () => {
    const res = await asUser(emp).get('/admin/agent/costs')
    expect(res.status).toBe(403)
  })

  it('admin recebe saldo ao vivo + gasto agregado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '9.00', granted_balance: '0', topped_up_balance: '9.00' }] }),
    })))
    await insert({ profile: admin, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const res = await asUser(admin).get('/admin/agent/costs')
    expect(res.status).toBe(200)
    expect(res.body.saldo.total).toBe(9)
    expect(res.body.saldo.moeda).toBe('USD')
    expect(res.body.saldoIndisponivel).toBe(false)
    expect(res.body.gasto.moeda).toBe('USD')
    expect(res.body.gasto.precosConfigurados).toBe(true)
    expect(res.body.gasto.precos).toEqual({ in: 0.14, out: 0.28, cached: 0.014 })
    expect(res.body.gasto.porDia).toHaveLength(1)
  })

  it('provedor sem saldo → saldoIndisponivel, sem quebrar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    const res = await asUser(admin).get('/admin/agent/costs')
    expect(res.status).toBe(200)
    expect(res.body.saldo).toBeNull()
    expect(res.body.saldoIndisponivel).toBe(true)
  })
})
