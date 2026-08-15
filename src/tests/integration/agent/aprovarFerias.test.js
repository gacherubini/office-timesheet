import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject, makeRunningEntry } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import aprovar from '../../../lib/agent/tools/write/proporAprovarFerias.js'

describe('propor_aprovar_ferias', () => {
  let admin, intern, intern2, emp, feriasIntern2, feriasEmp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    intern2 = await makeUser({ role: 'administrative_intern', name: 'I2' })
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    const a = await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, CURRENT_DATE, CURRENT_DATE + 5, 6, 'pending') RETURNING id`,
      [intern2.id],
    )
    feriasIntern2 = a.rows[0].id
    const b = await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, CURRENT_DATE, CURRENT_DATE + 2, 3, 'pending') RETURNING id`,
      [emp.id],
    )
    feriasEmp = b.rows[0].id
  })

  it('intern não propõe férias de outro intern', async () => {
    await expect(aprovar.propose(intern, { id: feriasIntern2 }))
      .rejects.toThrow('Você não tem permissão para aprovar esta solicitação.')
  })
  it('admin propõe; employee não tem a tool', async () => {
    const p = await aprovar.propose(admin, { id: feriasIntern2 })
    expect(p.kind).toBe('aprovar_ferias')
    expect(buildRegistry(emp).get('propor_aprovar_ferias')).toBeUndefined()
  })
  it('férias que cobrem hoje encerram o timer do alvo', async () => {
    const proj = await makeProject({ name: 'P' })
    await makeRunningEntry({ user_id: emp.id, project_id: proj.id, started_at: new Date(Date.now() - 3600_000).toISOString() })
    const { payload } = await aprovar.propose(admin, { id: feriasEmp })
    await aprovar.execute(admin, payload)
    const { rows } = await query(
      `SELECT status FROM time_entries WHERE user_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [emp.id],
    )
    expect(rows[0].status).toBe('completed')
  })
})
