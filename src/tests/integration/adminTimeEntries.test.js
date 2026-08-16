import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makePause } from '../helpers/factories.js'

const cents = (v) => Math.round(Number(v) * 100)
const refCost = (min, rate) => Number(((min / 60) * rate).toFixed(2))
const RATE = 100

async function completedEntry(admin, employee, project, started_at, ended_at) {
  const res = await asUser(admin)
    .post('/admin/time-entries')
    .send({ user_id: employee.id, project_id: project.id, started_at, ended_at })
  expect(res.status).toBe(201)
  return res.body
}

describe('Admin — editar/excluir apontamentos', () => {
  let admin, employee, projectA, projectB
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE })
    projectA = await makeProject({ name: 'Projeto A' })
    projectB = await makeProject({ name: 'Projeto B' })
  })

  it('editar o horário recalcula duração e custo', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00', // 2h → 200
    )
    const res = await asUser(admin)
      .put(`/admin/time-entries/${entry.id}`)
      .send({ ended_at: '2026-07-10T14:00:00-03:00' }) // agora 5h
    expect(res.status).toBe(200)
    expect(res.body.duration_minutes).toBe(300)
    expect(cents(res.body.cost_snapshot)).toBe(cents(refCost(300, RATE)))

    const earn = await asUser(employee).get('/me/project-earnings')
    expect(earn.body[0].total_minutes).toBe(300)
    expect(cents(earn.body[0].total_cost)).toBe(cents(refCost(300, RATE)))
  })

  it('editar só o projeto mantém o custo e reatribui', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const res = await asUser(admin)
      .put(`/admin/time-entries/${entry.id}`)
      .send({ project_id: projectB.id })
    expect(res.status).toBe(200)
    expect(res.body.project_id).toBe(projectB.id)
    expect(cents(res.body.cost_snapshot)).toBe(cents(refCost(120, RATE)))

    const earn = await asUser(employee).get('/me/project-earnings')
    expect(earn.body).toHaveLength(1)
    expect(earn.body[0].project_id).toBe(projectB.id)
  })

  it('editar com saída <= início → 400', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const res = await asUser(admin)
      .put(`/admin/time-entries/${entry.id}`)
      .send({ ended_at: '2026-07-10T08:00:00-03:00' })
    expect(res.status).toBe(400)
  })

  it('editar apontamento inexistente → 404; corpo vazio → 400', async () => {
    const notFound = await asUser(admin)
      .put('/admin/time-entries/00000000-0000-0000-0000-000000000000')
      .send({ project_id: projectB.id })
    expect(notFound.status).toBe(404)

    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const empty = await asUser(admin).put(`/admin/time-entries/${entry.id}`).send({})
    expect(empty.status).toBe(400)
  })

  it('excluir remove o apontamento do ganho', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const del = await asUser(admin).delete(`/admin/time-entries/${entry.id}`)
    expect(del.status).toBe(200)

    const earn = await asUser(employee).get('/me/project-earnings')
    expect(earn.body).toEqual([])

    const delAgain = await asUser(admin).delete(`/admin/time-entries/${entry.id}`)
    expect(delAgain.status).toBe(404)
  })

  it('editar/excluir exige admin (funcionário → 403)', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const put = await asUser(employee)
      .put(`/admin/time-entries/${entry.id}`)
      .send({ project_id: projectB.id })
    expect(put.status).toBe(403)

    const del = await asUser(employee).delete(`/admin/time-entries/${entry.id}`)
    expect(del.status).toBe(403)
  })

  it('PUT com ended_at em entry running força completed e grava edited_by', async () => {
    const { rows } = await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '2 hours', 'running')
       RETURNING id`,
      [employee.id, projectA.id],
    )
    const entryId = rows[0].id

    const res = await asUser(admin)
      .put(`/admin/time-entries/${entryId}`)
      .send({ ended_at: new Date().toISOString() })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
    expect(res.body.ended_at).toBeTruthy()
    expect(res.body.edited_by).toBe(admin.id)
    expect(res.body.edited_at).toBeTruthy()
    expect(res.body.duration_minutes).toBeGreaterThanOrEqual(110)

    // timer liberado — usuário consegue abrir outro
    const start = await asUser(employee).post('/time-entries/start').send({ project_id: projectB.id })
    expect(start.status).toBe(200)
  })

  it('Save que reenvia os horários de um dia com pausa NÃO paga o almoço', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T18:00:00-03:00',
    )
    await query(
      `UPDATE time_entries SET duration_minutes = 480, cost_snapshot = 800 WHERE id = $1`,
      [entry.id],
    )
    await makePause({
      time_entry_id: entry.id,
      paused_at: '2026-07-10T12:00:00-03:00',
      resumed_at: '2026-07-10T13:00:00-03:00',
    })

    const res = await asUser(admin).put(`/admin/time-entries/${entry.id}`).send({
      project_id: projectB.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T18:00:00-03:00',
    })
    expect(res.status).toBe(200)
    expect(res.body.project_id).toBe(projectB.id)
    expect(res.body.duration_minutes).toBe(480)
    expect(cents(res.body.cost_snapshot)).toBe(cents(800))
  })

  it('editar horário depois de aumento usa a taxa do snapshot, não a atual', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    await query('UPDATE users SET hourly_rate = 200 WHERE id = $1', [employee.id])

    const res = await asUser(admin).put(`/admin/time-entries/${entry.id}`).send({
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T12:00:00-03:00',
    })
    expect(res.status).toBe(200)
    expect(res.body.duration_minutes).toBe(180)
    expect(cents(res.body.cost_snapshot)).toBe(cents(refCost(180, RATE)))
  })

  it('criar apontamento sobreposto no mesmo horário → 409', async () => {
    await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T12:00:00-03:00',
    )
    const res = await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: projectB.id,
      started_at: '2026-07-10T11:00:00-03:00',
      ended_at: '2026-07-10T14:00:00-03:00',
    })
    expect(res.status).toBe(409)
  })

  it('criar apontamento de mais de 24h ou no futuro → 400', async () => {
    const long = await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: projectA.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-12T09:00:00-03:00',
    })
    expect(long.status).toBe(400)

    const future = await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: projectA.id,
      started_at: '2035-07-10T09:00:00-03:00',
      ended_at: '2035-07-10T11:00:00-03:00',
    })
    expect(future.status).toBe(400)
  })

  it('criar para horista sem valor/hora → 400', async () => {
    const semTaxa = await makeUser({ role: 'employee', hourly_rate: 0, name: 'Sem taxa' })
    const res = await asUser(admin).post('/admin/time-entries').send({
      user_id: semTaxa.id,
      project_id: projectA.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T11:00:00-03:00',
    })
    expect(res.status).toBe(400)
  })

  it('lista inclui as pausas do apontamento', async () => {
    const entry = await completedEntry(
      admin, employee, projectA,
      '2026-08-10T09:00:00-03:00', '2026-08-10T18:00:00-03:00',
    )
    await makePause({
      time_entry_id: entry.id,
      paused_at: '2026-08-10T12:00:00-03:00',
      resumed_at: '2026-08-10T13:00:00-03:00',
    })
    const res = await asUser(admin).get(
      '/admin/time-entries?start_date=2026-08-01&end_date=2026-08-31',
    )
    const row = res.body.data.find((e) => e.id === entry.id)
    expect(row.pauses).toHaveLength(1)
    expect(row.pauses[0].resumed_at).toBeTruthy()
  })

  it('resumo do mês soma só apontamentos concluídos', async () => {
    await completedEntry(
      admin, employee, projectA,
      '2026-08-10T09:00:00-03:00', '2026-08-10T11:00:00-03:00',
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, '2026-08-11T09:00:00-03:00', 'running', 999, 999)`,
      [employee.id, projectA.id],
    )
    const res = await asUser(admin).get(
      '/admin/time-entries?start_date=2026-08-01&end_date=2026-08-31',
    )
    expect(res.status).toBe(200)
    expect(res.body.summary.total_minutes).toBe(120)
    expect(cents(res.body.summary.total_cost)).toBe(cents(refCost(120, RATE)))
  })
})
