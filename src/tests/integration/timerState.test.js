import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import {
  makeUser,
  makeProject,
  makeRunningEntry,
  makeCompletedEntry,
  makeVacation,
} from '../helpers/factories.js'

const ymd = (offsetDays) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

describe('/me/active-timer — estado do cronômetro em andamento', () => {
  let employee, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
  })

  it('sem apontamento em andamento → null', async () => {
    const res = await asUser(employee).get('/me/active-timer')
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('em andamento com pausa fechada → soma os segundos pausados e paused=false', async () => {
    const entry = await makeRunningEntry({ user_id: employee.id, project_id: project.id, started_at: new Date() })
    // Pausa de exatamente 30 min (mesmo now() no insert → diferença exata).
    await query(
      `INSERT INTO time_entry_pauses (time_entry_id, paused_at, resumed_at)
       VALUES ($1, now() - interval '40 minutes', now() - interval '10 minutes')`,
      [entry.id],
    )
    const res = await asUser(employee).get('/me/active-timer')
    expect(res.body.project_id).toBe(project.id)
    expect(res.body.total_paused_seconds).toBe(1800)
    expect(res.body.paused).toBe(false)
  })

  it('em andamento com pausa aberta → paused=true, paused_at presente, não conta como segundos fechados', async () => {
    const entry = await makeRunningEntry({ user_id: employee.id, project_id: project.id, started_at: new Date() })
    await query(
      `INSERT INTO time_entry_pauses (time_entry_id, paused_at, resumed_at)
       VALUES ($1, now() - interval '5 minutes', NULL)`,
      [entry.id],
    )
    const res = await asUser(employee).get('/me/active-timer')
    expect(res.body.paused).toBe(true)
    expect(res.body.paused_at).toBeTruthy()
    expect(res.body.total_paused_seconds).toBe(0)
  })
})

describe('/me/time-clock-status — status de ponto', () => {
  let employee, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
  })

  it('sem apontamentos → tudo false', async () => {
    const res = await asUser(employee).get('/me/time-clock-status')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ active: false, clocked_in_today: false, has_any_entry: false })
  })

  it('apontamento em andamento hoje → active e clocked_in_today', async () => {
    await makeRunningEntry({ user_id: employee.id, project_id: project.id, started_at: new Date() })
    const res = await asUser(employee).get('/me/time-clock-status')
    expect(res.body).toMatchObject({ active: true, clocked_in_today: true, has_any_entry: true })
  })

  it('só apontamento concluído em dia passado → não ativo, não bateu ponto hoje', async () => {
    await makeCompletedEntry({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2020-01-01T12:00:00-03:00',
      ended_at: '2020-01-01T13:00:00-03:00',
      duration_minutes: 60,
      cost_snapshot: 100,
    })
    const res = await asUser(employee).get('/me/time-clock-status')
    expect(res.body).toMatchObject({ active: false, clocked_in_today: false, has_any_entry: true })
  })
})

describe('Férias — só aprovadas bloqueiam o cronômetro', () => {
  let employee, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject()
  })

  it('férias PENDENTES não bloqueiam o start', async () => {
    await makeVacation({
      user_id: employee.id,
      start_date: ymd(-2),
      end_date: ymd(2),
      days_count: 5,
      status: 'pending',
    })
    const res = await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    expect(res.status).toBe(200)
  })

  it('férias aprovadas fora do período de hoje não bloqueiam', async () => {
    await makeVacation({
      user_id: employee.id,
      start_date: ymd(10),
      end_date: ymd(20),
      days_count: 10,
      status: 'approved',
    })
    const res = await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    expect(res.status).toBe(200)
  })
})
