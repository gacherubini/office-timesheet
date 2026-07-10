import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makeRunningEntry } from '../helpers/factories.js'

const cents = (v) => Math.round(Number(v) * 100)
const refCost = (min, rate) => Number(((min / 60) * rate).toFixed(2))
const RATE = 100

// Cria um apontamento concluído via admin e devolve o id.
async function completedEntry(admin, employee, project, started_at, ended_at) {
  const res = await asUser(admin)
    .post('/admin/time-entries')
    .send({ user_id: employee.id, project_id: project.id, started_at, ended_at })
  expect(res.status).toBe(201)
  return res.body.id
}

describe('Solicitações de alteração de apontamento', () => {
  let admin, employee, projectA, projectB
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE })
    projectA = await makeProject({ name: 'Projeto A' })
    projectB = await makeProject({ name: 'Projeto B' })
  })

  it('aprovar recalcula duração/custo e reatribui o projeto (afeta o ganho)', async () => {
    // Original: 2h no projeto A → custo 200.
    const entryId = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const before = await asUser(employee).get('/me/project-earnings')
    expect(cents(before.body[0].total_cost)).toBe(cents(refCost(120, RATE)))

    // Solicita mudar para 3h no projeto B.
    const reqRes = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectB.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'Esqueci de trocar o projeto e o horário',
    })
    expect(reqRes.status).toBe(201)
    expect(reqRes.body.status).toBe('pending')

    // Aprova.
    const approve = await asUser(admin)
      .post(`/admin/time-entry-change-requests/${reqRes.body.id}/approve`)
      .send({ admin_note: 'ok' })
    expect(approve.status).toBe(200)

    // Ganho agora reflete 3h no projeto B (custo 300), e A ficou zerado.
    const after = await asUser(employee).get('/me/project-earnings')
    expect(after.body).toHaveLength(1)
    expect(after.body[0].project_id).toBe(projectB.id)
    expect(after.body[0].total_minutes).toBe(180)
    expect(cents(after.body[0].total_cost)).toBe(cents(refCost(180, RATE)))
  })

  it('rejeitar não altera o apontamento', async () => {
    const entryId = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const reqRes = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectB.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T15:00:00-03:00',
      reason: 'teste',
    })
    const reject = await asUser(admin)
      .post(`/admin/time-entry-change-requests/${reqRes.body.id}/reject`)
      .send({ admin_note: 'nao' })
    expect(reject.status).toBe(200)
    expect(reject.body.status).toBe('rejected')

    const after = await asUser(employee).get('/me/project-earnings')
    expect(after.body[0].project_id).toBe(projectA.id)
    expect(cents(after.body[0].total_cost)).toBe(cents(refCost(120, RATE)))
  })

  it('só uma solicitação pendente por apontamento → 409', async () => {
    const entryId = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const body = {
      time_entry_id: entryId,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'teste',
    }
    const first = await asUser(employee).post('/me/time-entry-change-requests').send(body)
    expect(first.status).toBe(201)
    const second = await asUser(employee).post('/me/time-entry-change-requests').send(body)
    expect(second.status).toBe(409)
  })

  it('validações: sem motivo → 400; saída <= início → 400', async () => {
    const entryId = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const noReason = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: '  ',
    })
    expect(noReason.status).toBe(400)

    const badRange = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T12:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'teste',
    })
    expect(badRange.status).toBe(400)
  })

  it('apontamento em andamento não pode ter solicitação → 400', async () => {
    const running = await makeRunningEntry({
      user_id: employee.id,
      project_id: projectA.id,
      started_at: new Date(),
    })
    const res = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: running.id,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'teste',
    })
    expect(res.status).toBe(400)
  })

  it('solicitação de apontamento de outro usuário → 404', async () => {
    const other = await makeUser({ role: 'employee', hourly_rate: RATE })
    const entryId = await completedEntry(
      admin, other, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const res = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'teste',
    })
    expect(res.status).toBe(404)
  })

  it('aprovar/rejeitar exige aprovador (funcionário → 403)', async () => {
    const entryId = await completedEntry(
      admin, employee, projectA,
      '2026-07-10T09:00:00-03:00', '2026-07-10T11:00:00-03:00',
    )
    const reqRes = await asUser(employee).post('/me/time-entry-change-requests').send({
      time_entry_id: entryId,
      requested_project_id: projectA.id,
      requested_started_at: '2026-07-10T09:00:00-03:00',
      requested_ended_at: '2026-07-10T12:00:00-03:00',
      reason: 'teste',
    })
    const res = await asUser(employee)
      .post(`/admin/time-entry-change-requests/${reqRes.body.id}/approve`)
      .send({})
    expect(res.status).toBe(403)
  })
})
