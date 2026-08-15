import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import aprovar from '../../../lib/agent/tools/write/proporAprovarDespesa.js'
import rejeitar from '../../../lib/agent/tools/write/proporRejeitarDespesa.js'

describe('propor_aprovar/rejeitar_despesa', () => {
  let admin, intern, emp, despesaId
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    const { rows } = await query(
      `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
       VALUES ($1,'Uber',48.9,'2026-08-14','pending') RETURNING id`,
      [emp.id],
    )
    despesaId = rows[0].id
  })

  it('employee não tem as tools', () => {
    expect(buildRegistry(emp).get('propor_aprovar_despesa')).toBeUndefined()
    expect(buildRegistry(emp).get('propor_rejeitar_despesa')).toBeUndefined()
  })
  it('propose de pending não grava; intern consegue', async () => {
    const p = await aprovar.propose(intern, { id: despesaId })
    expect(p.kind).toBe('aprovar_despesa')
    expect(p.dados.titulo).toBe('Uber')
    const { rows } = await query('SELECT status FROM expense_requests WHERE id = $1', [despesaId])
    expect(rows[0].status).toBe('pending')
  })
  it('já decidida recusa com a mensagem da rota', async () => {
    await query(`UPDATE expense_requests SET status = 'approved' WHERE id = $1`, [despesaId])
    await expect(aprovar.propose(admin, { id: despesaId })).rejects.toThrow('Despesa pendente não encontrada.')
  })
  it('execute de corrida (outro UPDATE no meio) recusa', async () => {
    const { payload } = await aprovar.propose(admin, { id: despesaId })
    await query(`UPDATE expense_requests SET status = 'approved' WHERE id = $1`, [despesaId])
    await expect(aprovar.execute(admin, payload)).rejects.toThrow('Despesa pendente não encontrada.')
  })
  it('execute aprova; rejeitar grava rejected', async () => {
    await aprovar.execute(admin, { id: despesaId, admin_note: null })
    const { rows } = await query('SELECT status FROM expense_requests WHERE id = $1', [despesaId])
    expect(rows[0].status).toBe('approved')
    const { rows: r2 } = await query(
      `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
       VALUES ($1,'Taxi',10,'2026-08-14','pending') RETURNING id`,
      [emp.id],
    )
    await rejeitar.execute(intern, { id: r2[0].id, admin_note: 'fora da política' })
    const { rows: after } = await query('SELECT status FROM expense_requests WHERE id = $1', [r2[0].id])
    expect(after[0].status).toBe('rejected')
  })
})
