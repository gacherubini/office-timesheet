import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeProject, makeCompletedEntry, makeRunningEntry } from '../helpers/factories.js'

describe('/me/history — paginação e formato', () => {
  let employee, project
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', hourly_rate: 100 })
    project = await makeProject({ name: 'Projeto H' })
  })

  it('pagina, ordena por started_at desc e inclui todos os status', async () => {
    for (let d = 1; d <= 23; d++) {
      const dd = String(d).padStart(2, '0')
      await makeCompletedEntry({
        user_id: employee.id,
        project_id: project.id,
        started_at: `2026-07-${dd}T09:00:00-03:00`,
        ended_at: `2026-07-${dd}T10:00:00-03:00`,
        duration_minutes: 60,
        cost_snapshot: 100,
      })
    }
    // Um em andamento, o mais recente → deve vir primeiro (desc) e aparecer no histórico.
    await makeRunningEntry({
      user_id: employee.id,
      project_id: project.id,
      started_at: new Date('2026-07-24T12:00:00Z'),
    })

    const p1 = await asUser(employee).get('/me/history?page=1&limit=15')
    expect(p1.status).toBe(200)
    expect(p1.body.data).toHaveLength(15)
    expect(p1.body.pagination).toMatchObject({ page: 1, limit: 15, total: 24, pages: 2 })
    expect(p1.body.data[0].status).toBe('running')
    expect(p1.body.data[0]).toHaveProperty('projects.name', 'Projeto H')

    const p2 = await asUser(employee).get('/me/history?page=2&limit=15')
    expect(p2.body.data).toHaveLength(9)
  })

  it('limit é limitado a 50 e page mínima 1', async () => {
    const res = await asUser(employee).get('/me/history?page=0&limit=999')
    expect(res.body.pagination.page).toBe(1)
    expect(res.body.pagination.limit).toBe(50)
  })

  it('sem apontamentos → data vazia, total 0', async () => {
    const res = await asUser(employee).get('/me/history')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.pagination.total).toBe(0)
  })
})
