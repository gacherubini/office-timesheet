import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import rejeitar from '../../../lib/agent/tools/write/proporRejeitarFerias.js'

describe('propor_rejeitar_ferias', () => {
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

  it('intern não propõe rejeitar férias de outro intern', async () => {
    await expect(rejeitar.propose(intern, { id: feriasIntern2 }))
      .rejects.toThrow('Você não tem permissão para rejeitar esta solicitação.')
  })
  it('admin propõe; employee não tem a tool; propose não grava', async () => {
    const p = await rejeitar.propose(admin, { id: feriasIntern2, nota: 'equipe curta' })
    expect(p.kind).toBe('rejeitar_ferias')
    expect(p.payload.admin_note).toBe('equipe curta')
    expect(buildRegistry(emp).get('propor_rejeitar_ferias')).toBeUndefined()
    const { rows } = await query('SELECT status FROM vacation_requests WHERE id = $1', [feriasIntern2])
    expect(rows[0].status).toBe('pending')
  })
  it('já decidida recusa com a mensagem da rota', async () => {
    await query(`UPDATE vacation_requests SET status = 'approved' WHERE id = $1`, [feriasEmp])
    await expect(rejeitar.propose(admin, { id: feriasEmp })).rejects.toThrow('Esta solicitação já foi decidida.')
  })
  it('execute de corrida recusa; execute rejeita pending', async () => {
    const { payload } = await rejeitar.propose(admin, { id: feriasEmp })
    await query(`UPDATE vacation_requests SET status = 'approved' WHERE id = $1`, [feriasEmp])
    await expect(rejeitar.execute(admin, payload)).rejects.toThrow('Esta solicitação já foi decidida.')

    const { rows: extra } = await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, CURRENT_DATE + 10, CURRENT_DATE + 12, 3, 'pending') RETURNING id`,
      [emp.id],
    )
    await rejeitar.execute(intern, { id: extra[0].id, admin_note: 'equipe curta' })
    const { rows: after } = await query('SELECT status FROM vacation_requests WHERE id = $1', [extra[0].id])
    expect(after[0].status).toBe('rejected')
  })
})
