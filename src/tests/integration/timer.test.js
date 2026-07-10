import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makeApprovedVacation } from '../helpers/factories.js'

const RATE = 120
const cents = (v) => Math.round(Number(v) * 100)
const refCost = (min, rate) => Number(((min / 60) * rate).toFixed(2))

// Insere um apontamento 'running' começando N minutos atrás, medido pelo
// relógio do próprio banco (evita descompasso entre processo e DB).
async function startedMinutesAgo(user_id, project_id, minutes) {
  const { rows } = await query(
    `INSERT INTO time_entries (user_id, project_id, started_at, status)
     VALUES ($1, $2, now() - ($3 || ' minutes')::interval, 'running')
     RETURNING id`,
    [user_id, project_id, String(minutes)],
  )
  return rows[0].id
}

const ymd = (offsetDays) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

describe('Cronômetro de projeto — ciclo de vida', () => {
  let employee, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE })
    project = await makeProject()
  })

  it('start cria um apontamento em andamento', async () => {
    const res = await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('running')
    expect(res.body.project_id).toBe(project.id)

    const active = await asUser(employee).get('/me/active-timer')
    expect(active.body).not.toBeNull()
    expect(active.body.project_id).toBe(project.id)
  })

  it('start sem project_id → 400', async () => {
    const res = await asUser(employee).post('/time-entries/start').send({})
    expect(res.status).toBe(400)
  })

  it('start com apontamento já aberto → 409 (um por usuário)', async () => {
    await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    const res = await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    expect(res.status).toBe(409)
  })

  it('start bloqueado durante férias aprovadas → 403', async () => {
    await makeApprovedVacation({ user_id: employee.id, start_date: ymd(-2), end_date: ymd(2), days_count: 5 })
    const res = await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    expect(res.status).toBe(403)
  })

  it('stop sem apontamento aberto → 404', async () => {
    const res = await asUser(employee).post('/time-entries/stop').send({})
    expect(res.status).toBe(404)
  })

  it('stop calcula a duração (~90 min) e o custo consistente com a duração', async () => {
    await startedMinutesAgo(employee.id, project.id, 90)
    const res = await asUser(employee).post('/time-entries/stop').send({})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
    expect(res.body.ended_at).toBeTruthy()
    expect(res.body.duration_minutes).toBeGreaterThanOrEqual(88)
    expect(res.body.duration_minutes).toBeLessThanOrEqual(92)
    // invariante de pagamento: custo == duração/60 × rate (2 casas)
    expect(cents(res.body.cost_snapshot)).toBe(cents(refCost(res.body.duration_minutes, RATE)))
  })

  it('stop desconta o tempo pausado', async () => {
    const entryId = await startedMinutesAgo(employee.id, project.id, 60)
    // pausa de 30 min no meio (fechada)
    await query(
      `INSERT INTO time_entry_pauses (time_entry_id, paused_at, resumed_at)
       VALUES ($1, now() - interval '40 minutes', now() - interval '10 minutes')`,
      [entryId],
    )
    const res = await asUser(employee).post('/time-entries/stop').send({})
    expect(res.status).toBe(200)
    // 60 min de janela − 30 pausados ≈ 30 líquidos
    expect(res.body.duration_minutes).toBeGreaterThanOrEqual(28)
    expect(res.body.duration_minutes).toBeLessThanOrEqual(32)
  })

  it('pause registra pausa e resume a fecha; resume sem pausa → 404', async () => {
    await asUser(employee).post('/time-entries/start').send({ project_id: project.id })

    const pause = await asUser(employee).post('/time-entries/pause').send({})
    expect(pause.status).toBe(200)
    expect(pause.body.resumed_at).toBeNull()

    const resume = await asUser(employee).post('/time-entries/resume').send({})
    expect(resume.status).toBe(200)
    expect(resume.body.resumed_at).toBeTruthy()

    const resumeAgain = await asUser(employee).post('/time-entries/resume').send({})
    expect(resumeAgain.status).toBe(404)
  })

  it('resume é bloqueado durante férias (mas pause não)', async () => {
    await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    const pause = await asUser(employee).post('/time-entries/pause').send({})
    expect(pause.status).toBe(200) // pause não checa férias

    await makeApprovedVacation({ user_id: employee.id, start_date: ymd(-2), end_date: ymd(2), days_count: 5 })
    const resume = await asUser(employee).post('/time-entries/resume').send({})
    expect(resume.status).toBe(403)
  })
})

describe('Cronômetro — notificações para admins', () => {
  let employee, admin, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE, name: 'Funcionário' })
    admin = await makeAdmin({ name: 'Chefe' })
    project = await makeProject({ name: 'Projeto X' })
  })

  it('start e stop geram notificação para o admin (com o projeto), sem notificar o próprio ator', async () => {
    await asUser(employee).post('/time-entries/start').send({ project_id: project.id })
    await asUser(employee).post('/time-entries/stop').send({})

    const adminNotifs = await asUser(admin).get('/notifications')
    const types = adminNotifs.body.map((n) => n.type)
    expect(types).toContain('time_entry_started')
    expect(types).toContain('time_entry_stopped')
    const started = adminNotifs.body.find((n) => n.type === 'time_entry_started')
    expect(started.project_name).toBe('Projeto X')

    // o funcionário (ator) não recebe notificação dos próprios eventos
    const empNotifs = await asUser(employee).get('/notifications')
    expect(empNotifs.body.filter((n) => n.type?.startsWith('time_entry')).length).toBe(0)
  })
})
