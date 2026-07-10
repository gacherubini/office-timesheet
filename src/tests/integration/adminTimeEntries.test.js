import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

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
})
