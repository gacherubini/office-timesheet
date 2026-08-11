import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { request } from '../helpers/api.js'

const DEFAULT_CONFIG = {
  target_amount: 0,
  overrides: {},
}

describe('/me/simulation — simulador de performance', () => {
  let employee
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
  })

  it('sem registro retorna a config padrão', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ month: '2026-08', config: DEFAULT_CONFIG })
  })

  it('PUT persiste e GET seguinte devolve a mesma config (upsert)', async () => {
    const config = {
      target_amount: 5000,
      overrides: { '2026-08-15': 300 },
    }
    const put = await asUser(employee).put('/me/simulation').send({ month: '2026-08', config })
    expect(put.status).toBe(200)
    expect(put.body.config).toEqual(config)

    const get = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get.body.config).toEqual(config)

    // Upsert: segundo PUT substitui a config inteira.
    const config2 = { target_amount: 8000, overrides: {} }
    await asUser(employee).put('/me/simulation').send({ month: '2026-08', config: config2 })
    const get2 = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get2.body.config).toEqual(config2)
  })

  it('GET com month malformado → 400', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-8')
    expect(res.status).toBe(400)
  })

  it('PUT com month malformado → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-8', config: DEFAULT_CONFIG })
    expect(res.status).toBe(400)
  })

  it('PUT com target_amount negativo → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', config: { ...DEFAULT_CONFIG, target_amount: -10 } })
    expect(res.status).toBe(400)
  })

  it('PUT com override fora do mês → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', config: { ...DEFAULT_CONFIG, overrides: { '2026-09-01': 480 } } })
    expect(res.status).toBe(400)
  })

  it('PUT com minutos de override fora de 0–1440 → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', config: { ...DEFAULT_CONFIG, overrides: { '2026-08-10': 2000 } } })
    expect(res.status).toBe(400)
  })

  it('exige autenticação', async () => {
    const res = await request.get('/me/simulation?month=2026-08')
    expect(res.status).toBe(401)
  })
})
