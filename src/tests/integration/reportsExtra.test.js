import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const cents = (v) => Math.round(Number(v) * 100)

async function entry(admin, user, project, started_at, ended_at) {
  const res = await asUser(admin)
    .post('/admin/time-entries')
    .send({ user_id: user.id, project_id: project.id, started_at, ended_at })
  expect(res.status).toBe(201)
}

describe('/admin/reports/financial', () => {
  let admin, employee, project
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
    // 2h + 3h = 300 min, custo 500 (sem despesas/bônus).
    await entry(admin, employee, project, '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00')
    await entry(admin, employee, project, '2026-07-11T09:00:00-03:00', '2026-07-11T12:00:00-03:00')
  })

  it('resume totais do período (horas e valor a pagar)', async () => {
    const res = await asUser(admin).get('/admin/reports/financial?start_date=2026-07-01&end_date=2026-07-31')
    expect(res.status).toBe(200)
    expect(res.body.summary.total_minutes).toBe(300)
    expect(cents(res.body.summary.hours_cost)).toBe(cents(500))
    expect(cents(res.body.summary.total_payable)).toBe(cents(500))
    expect(res.body.summary.active_people).toBe(1)
  })

  it('sem datas → 400; não-admin → 403', async () => {
    expect((await asUser(admin).get('/admin/reports/financial')).status).toBe(400)
    expect(
      (await asUser(employee).get('/admin/reports/financial?start_date=2026-07-01&end_date=2026-07-31')).status,
    ).toBe(403)
  })
})

describe('/admin/reports/daily-hours', () => {
  let admin, employee, project
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
    await entry(admin, employee, project, '2026-07-10T09:00:00-03:00', '2026-07-10T13:00:00-03:00') // 240 min
    await entry(admin, employee, project, '2026-07-11T09:00:00-03:00', '2026-07-11T11:00:00-03:00') // 120 min
  })

  it('agrupa por colaborador/dia com minutos e custo', async () => {
    const res = await asUser(admin).get('/admin/reports/daily-hours?start_date=2026-07-01&end_date=2026-07-31')
    expect(res.status).toBe(200)
    expect(res.body.daily_hours).toHaveLength(2)
    const totalMinutes = res.body.daily_hours.reduce((s, d) => s + d.total_minutes, 0)
    const totalCost = res.body.daily_hours.reduce((s, d) => s + Number(d.total_cost), 0)
    expect(totalMinutes).toBe(360)
    expect(cents(totalCost)).toBe(cents(600))
  })

  it('filtra por user_id', async () => {
    const other = await makeUser({ role: 'employee', hourly_rate: 100 })
    await entry(admin, other, project, '2026-07-12T09:00:00-03:00', '2026-07-12T10:00:00-03:00')
    const res = await asUser(admin)
      .get(`/admin/reports/daily-hours?start_date=2026-07-01&end_date=2026-07-31&user_id=${other.id}`)
    expect(res.status).toBe(200)
    expect(res.body.daily_hours).toHaveLength(1)
    expect(res.body.daily_hours[0].user_id).toBe(other.id)
  })

  it('sem datas → 400; não-admin → 403', async () => {
    expect((await asUser(admin).get('/admin/reports/daily-hours')).status).toBe(400)
    expect(
      (await asUser(employee).get('/admin/reports/daily-hours?start_date=2026-07-01&end_date=2026-07-31')).status,
    ).toBe(403)
  })
})
