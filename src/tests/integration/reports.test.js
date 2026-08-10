import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const cents = (v) => Math.round(Number(v) * 100)
const refCost = (min, rate) => Number(((min / 60) * rate).toFixed(2))

async function entry(admin, user, project, started_at, ended_at) {
  const res = await asUser(admin)
    .post('/admin/time-entries')
    .send({ user_id: user.id, project_id: project.id, started_at, ended_at })
  expect(res.status).toBe(201)
}

describe('Relatórios de admin — folha e custo por projeto', () => {
  let admin, emp1, emp2, projectA, projectB
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp1 = await makeUser({ role: 'employee', hourly_rate: 100, name: 'Ana' })
    emp2 = await makeUser({ role: 'employee', hourly_rate: 200, name: 'Bruno' })
    projectA = await makeProject({ name: 'Projeto A' })
    projectB = await makeProject({ name: 'Projeto B' })
    // Ana: 2h no A (custo 200). Bruno: 3h no B (custo 600).
    await entry(admin, emp1, projectA, '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00')
    await entry(admin, emp2, projectB, '2026-07-15T09:00:00-03:00', '2026-07-15T12:00:00-03:00')
  })

  it('/admin/reports/payroll soma o custo de horas por colaborador (é o valor a pagar)', async () => {
    const res = await asUser(admin).get('/admin/reports/payroll?start_date=2026-07-01&end_date=2026-07-31')
    expect(res.status).toBe(200)

    const ana = res.body.payroll.find((p) => p.id === emp1.id)
    const bruno = res.body.payroll.find((p) => p.id === emp2.id)
    expect(cents(ana.hours_cost)).toBe(cents(refCost(120, 100))) // 200
    expect(cents(ana.total)).toBe(cents(refCost(120, 100)))
    expect(cents(bruno.hours_cost)).toBe(cents(refCost(180, 200))) // 600

    // sem despesas/bônus, o total da folha é só o custo de horas
    expect(cents(res.body.summary.total_hours_cost)).toBe(cents(800))
    expect(cents(res.body.summary.total_payroll)).toBe(cents(800))
    expect(cents(res.body.summary.total_expenses)).toBe(0)
    expect(cents(res.body.summary.total_bonuses)).toBe(0)
  })

  it('/admin/reports/payroll sem datas → 400; sem ser admin → 403', async () => {
    const noDates = await asUser(admin).get('/admin/reports/payroll')
    expect(noDates.status).toBe(400)
    const asEmployee = await asUser(emp1).get('/admin/reports/payroll?start_date=2026-07-01&end_date=2026-07-31')
    expect(asEmployee.status).toBe(403)
  })

  it('/admin/reports/project-cost agrega minutos/custo por projeto', async () => {
    const res = await asUser(admin).get('/admin/reports/project-cost?start_date=2026-07-01&end_date=2026-07-31')
    expect(res.status).toBe(200)

    const a = res.body.projects.find((p) => p.id === projectA.id)
    const b = res.body.projects.find((p) => p.id === projectB.id)
    expect(a.total_minutes).toBe(120)
    expect(cents(a.total_cost)).toBe(cents(refCost(120, 100)))
    expect(a.members_count).toBe(1)
    expect(b.total_minutes).toBe(180)
    expect(cents(b.total_cost)).toBe(cents(refCost(180, 200)))
  })

  it('range de relatórios usa America/Sao_Paulo (noite BRT não some no dia UTC seguinte)', async () => {
    // 09/ago 22:30-23:00 SP = 10/ago 01:30-02:00 UTC — tem que entrar no dia 09 SP.
    await entry(admin, emp1, projectA, '2026-08-09T22:30:00-03:00', '2026-08-09T23:00:00-03:00')

    const day9 = await asUser(admin).get('/admin/reports/project-cost?start_date=2026-08-09&end_date=2026-08-09')
    expect(day9.status).toBe(200)
    const a9 = day9.body.projects.find((p) => p.id === projectA.id)
    expect(a9?.total_minutes).toBe(30)

    const day10 = await asUser(admin).get('/admin/reports/project-cost?start_date=2026-08-10&end_date=2026-08-10')
    expect(day10.status).toBe(200)
    const a10 = day10.body.projects.find((p) => p.id === projectA.id)
    expect(a10).toBeUndefined()

    const daily = await asUser(admin).get('/admin/reports/daily-hours?start_date=2026-08-09&end_date=2026-08-09')
    expect(daily.status).toBe(200)
    const row = daily.body.daily_hours.find((d) => d.user_id === emp1.id && d.date === '2026-08-09')
    expect(row?.total_minutes).toBe(30)

    const payroll = await asUser(admin).get('/admin/reports/payroll?start_date=2026-08-09&end_date=2026-08-09')
    expect(payroll.status).toBe(200)
    const ana = payroll.body.payroll.find((p) => p.id === emp1.id)
    expect(cents(ana.hours_cost)).toBe(cents(refCost(30, 100)))
  })
})
