import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import tool from '../../../lib/agent/tools/read/aprovacoesPendentes.js'

describe('aprovacoes_pendentes', () => {
  let admin, intern, intern2, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    intern2 = await makeUser({ role: 'administrative_intern', name: 'I2' })
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    await query(
      `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
       VALUES ($1,'Uber',48.9,'2026-08-14','pending')`,
      [emp.id],
    )
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1,'2026-09-01','2026-09-10',10,'pending')`,
      [intern2.id],
    )
  })

  it('employee não tem a tool', () => {
    expect(buildRegistry(emp).get('aprovacoes_pendentes')).toBeUndefined()
  })
  it('intern não vê férias de outro intern; vê a despesa; JSON sem bonus e sem receipt_url', async () => {
    const r = await tool.run(intern, {})
    expect(r.data.despesas.some((d) => d.titulo === 'Uber')).toBe(true)
    expect(r.data.ferias.some((f) => f.pessoa === 'I2')).toBe(false)
    expect(r.data).not.toHaveProperty('bonus')
    expect(JSON.stringify(r.data)).not.toMatch(/receipt/)
    expect(r.count).toBe(r.data.despesas.length + r.data.ferias.length)
  })
  it('admin vê as férias do intern', async () => {
    const r = await tool.run(admin, {})
    expect(r.data.ferias.some((f) => f.pessoa === 'I2')).toBe(true)
  })
})
