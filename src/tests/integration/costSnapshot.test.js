import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const cents = (v) => Math.round(Number(v) * 100)
const refCost = (min, rate) => Number(((min / 60) * rate).toFixed(2))

describe('cost_snapshot — congelado no momento do apontamento', () => {
  let admin, employee, project
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
  })

  it('mudar o valor/hora depois NÃO altera o ganho de apontamentos passados', async () => {
    // Apontamento de 2h com rate 100 → custo 200.
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T11:00:00-03:00',
    })

    const before = await asUser(employee).get('/me/project-earnings')
    expect(cents(before.body[0].total_cost)).toBe(cents(refCost(120, 100)))

    // Aumenta o valor/hora do funcionário.
    await query('UPDATE users SET hourly_rate = 200 WHERE id = $1', [employee.id])

    // O ganho do apontamento antigo continua 200 (não vira 400).
    const after = await asUser(employee).get('/me/project-earnings')
    expect(cents(after.body[0].total_cost)).toBe(cents(refCost(120, 100)))

    // Um novo apontamento já usa o novo valor/hora (200).
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-11T09:00:00-03:00',
      ended_at: '2026-07-11T10:00:00-03:00', // 1h a 200 → 200
    })
    const total = await asUser(employee).get('/me/project-earnings')
    // 200 (antigo, rate 100) + 200 (novo, rate 200) = 400
    expect(cents(total.body[0].total_cost)).toBe(cents(400))
  })

  it('entrada manual com saída <= início → 400', async () => {
    const res = await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-10T11:00:00-03:00',
      ended_at: '2026-07-10T11:00:00-03:00',
    })
    expect(res.status).toBe(400)
  })

  it('usuário com valor/hora 0 → custo 0', async () => {
    const zero = await makeUser({ role: 'employee', hourly_rate: 0 })
    await asUser(admin).post('/admin/time-entries').send({
      user_id: zero.id,
      project_id: project.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T12:00:00-03:00',
    })
    const earn = await asUser(zero).get('/me/project-earnings')
    expect(earn.body[0].total_minutes).toBe(180)
    expect(cents(earn.body[0].total_cost)).toBe(0)
  })

  it('entrada manual exige admin (funcionário → 403)', async () => {
    const res = await asUser(employee).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T11:00:00-03:00',
    })
    expect(res.status).toBe(403)
  })
})
