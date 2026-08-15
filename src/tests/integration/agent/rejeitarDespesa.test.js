import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import rejeitar from '../../../lib/agent/tools/write/proporRejeitarDespesa.js'

describe('propor_rejeitar_despesa', () => {
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

  it('employee não tem a tool', () => {
    expect(buildRegistry(emp).get('propor_rejeitar_despesa')).toBeUndefined()
  })
  it('propose de pending não grava; intern consegue', async () => {
    const p = await rejeitar.propose(intern, { id: despesaId, nota: 'fora da política' })
    expect(p.kind).toBe('rejeitar_despesa')
    expect(p.dados.titulo).toBe('Uber')
    expect(p.payload.admin_note).toBe('fora da política')
    const { rows } = await query('SELECT status FROM expense_requests WHERE id = $1', [despesaId])
    expect(rows[0].status).toBe('pending')
  })
  it('já decidida recusa com a mensagem da rota', async () => {
    await query(`UPDATE expense_requests SET status = 'rejected' WHERE id = $1`, [despesaId])
    await expect(rejeitar.propose(admin, { id: despesaId })).rejects.toThrow('Despesa pendente não encontrada.')
  })
  it('sem linha recusa', async () => {
    await expect(rejeitar.propose(admin, { id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow('Não encontrei essa solicitação.')
  })
  it('execute de corrida recusa com a mensagem da rota', async () => {
    const { payload } = await rejeitar.propose(admin, { id: despesaId })
    await query(`UPDATE expense_requests SET status = 'approved' WHERE id = $1`, [despesaId])
    await expect(rejeitar.execute(admin, payload)).rejects.toThrow('Despesa pendente não encontrada.')
  })
})
