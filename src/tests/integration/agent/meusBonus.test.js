import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import tool from '../../../lib/agent/tools/read/meusBonus.js'

describe('meus_bonus', () => {
  let emp, outro, intern, admin
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    outro = await makeUser({ role: 'employee', name: 'Bruno' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    await query(
      `INSERT INTO bonuses (user_id, title, amount, bonus_date, created_by)
       VALUES ($1,'Meu',800,'2026-08-01',$4), ($2,'Alheio',424242,'2026-08-01',$4), ($3,'Do intern',50,'2026-08-01',$4), ($4,'Da admin',10,'2026-08-01',$4)`,
      [emp.id, outro.id, intern.id, admin.id],
    )
  })
  it('employee só vê as linhas dele; sentinela 424242 não aparece', async () => {
    const r = await tool.run(emp, {})
    expect(r.data.every((b) => b.titulo !== 'Alheio')).toBe(true)
    expect(r.data.some((b) => b.titulo === 'Meu' && b.valor === 800)).toBe(true)
    expect(JSON.stringify(r.data)).not.toMatch(/424242/)
    expect(r.data[0]).not.toHaveProperty('user_id')
    expect(r.data[0]).not.toHaveProperty('created_by')
  })
  it('intern TEM a tool e só as próprias; admin em meus_bonus também só as dele', async () => {
    expect(buildRegistry(intern).get('meus_bonus')).toBeTruthy()
    const i = await tool.run(intern, {})
    expect(i.data).toHaveLength(1)
    expect(i.data[0].titulo).toBe('Do intern')
    const a = await tool.run(admin, {})
    expect(a.data.every((b) => b.titulo === 'Da admin')).toBe(true)
  })
})
