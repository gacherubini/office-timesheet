import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const RATE = 100
const GOAL = 12000
const cents = (v) => Math.round(Number(v) * 100)

// Dias úteis de julho/2026 (mesma regra do endpoint: seg–sex).
function businessDaysJul2026() {
  let n = 0
  const last = new Date(2026, 7, 0).getDate()
  for (let d = 1; d <= last; d++) {
    const dow = new Date(2026, 6, d).getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

describe('/me/stats — KPIs do mês', () => {
  let admin, employee, project
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE, monthly_income_goal: GOAL })
    project = await makeProject()
  })

  it('agrega totais, média, metas e projeção corretamente', async () => {
    const entries = [
      ['2026-07-06T09:00:00-03:00', '2026-07-06T13:00:00-03:00'], // 240 min
      ['2026-07-07T09:00:00-03:00', '2026-07-07T17:00:00-03:00'], // 480 min
      ['2026-07-08T09:00:00-03:00', '2026-07-08T12:00:00-03:00'], // 180 min
    ]
    for (const [started_at, ended_at] of entries) {
      await asUser(admin).post('/admin/time-entries')
        .send({ user_id: employee.id, project_id: project.id, started_at, ended_at })
    }
    // Um apontamento em junho não pode entrar em julho.
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id, project_id: project.id,
      started_at: '2026-06-30T09:00:00-03:00', ended_at: '2026-06-30T18:00:00-03:00',
    })

    const totalMinutes = 240 + 480 + 180 // 900
    const totalCost = (900 / 60) * RATE // 1500
    const workingDays = 3
    const businessDays = businessDaysJul2026()

    const res = await asUser(employee).get('/me/stats?month=2026-07')
    expect(res.status).toBe(200)
    const s = res.body

    expect(s.total_minutes).toBe(totalMinutes)
    expect(cents(s.total_cost)).toBe(cents(totalCost))
    expect(s.working_days).toBe(workingDays)
    expect(s.avg_minutes_per_day).toBe(Math.round(totalMinutes / workingDays)) // 300
    expect(s.project_count).toBe(1)
    expect(s.business_days_in_month).toBe(businessDays)
    expect(s.goal_minutes).toBe(businessDays * 8 * 60)
    expect(s.monthly_income_goal).toBe(GOAL)
    expect(s.goal_amount_pct).toBe(Math.min(100, Math.round((totalCost / GOAL) * 100))) // 13
    expect(s.remaining_goal_amount).toBe(GOAL - totalCost) // 10500
    expect(cents(s.projected_monthly_income)).toBe(cents((totalCost / workingDays) * businessDays))
    expect(s.daily_totals).toHaveLength(workingDays)
  })

  it('mês sem apontamentos → zeros', async () => {
    const res = await asUser(employee).get('/me/stats?month=2026-07')
    expect(res.status).toBe(200)
    expect(res.body.total_minutes).toBe(0)
    expect(cents(res.body.total_cost)).toBe(0)
    expect(res.body.working_days).toBe(0)
    expect(res.body.goal_amount_pct).toBe(0)
  })

  it('estagiário administrativo → 403', async () => {
    const intern = await makeUser({ role: 'administrative_intern', hourly_rate: 0 })
    const res = await asUser(intern).get('/me/stats?month=2026-07')
    expect(res.status).toBe(403)
  })
})
