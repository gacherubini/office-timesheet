import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { request } from '../helpers/api.js'

describe('/me/simulation — simulador de performance', () => {
  let employee
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
  })

  it('sem registro retorna planned vazio', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ month: '2026-08', planned: {} })
  })

  it('PUT persiste e GET seguinte devolve o mesmo mapa (upsert)', async () => {
    const planned = { '2026-08-10': 480, '2026-08-11': 300 }
    const put = await asUser(employee).put('/me/simulation').send({ month: '2026-08', planned })
    expect(put.status).toBe(200)
    expect(put.body.planned).toEqual(planned)

    const get = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get.body.planned).toEqual(planned)

    // Upsert: segundo PUT substitui o mapa inteiro.
    const planned2 = { '2026-08-12': 240 }
    await asUser(employee).put('/me/simulation').send({ month: '2026-08', planned: planned2 })
    const get2 = await asUser(employee).get('/me/simulation?month=2026-08')
    expect(get2.body.planned).toEqual(planned2)
  })

  it('GET com month malformado → 400', async () => {
    const res = await asUser(employee).get('/me/simulation?month=2026-8')
    expect(res.status).toBe(400)
  })

  it('PUT com data fora do mês → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', planned: { '2026-09-01': 480 } })
    expect(res.status).toBe(400)
  })

  it('PUT com minutos fora de 0–1440 → 400', async () => {
    const res = await asUser(employee)
      .put('/me/simulation')
      .send({ month: '2026-08', planned: { '2026-08-10': 2000 } })
    expect(res.status).toBe(400)
  })

  it('exige autenticação', async () => {
    const res = await request.get('/me/simulation?month=2026-08')
    expect(res.status).toBe(401)
  })
})
