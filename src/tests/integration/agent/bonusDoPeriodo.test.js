import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import tool from '../../../lib/agent/tools/read/bonusDoPeriodo.js'

describe('bonus_do_periodo', () => {
  let admin, intern, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    await query(
      `INSERT INTO bonuses (user_id, title, amount, bonus_date, created_by)
       VALUES ($1,'Extra',800,'2026-08-01',$2)`,
      [emp.id, admin.id],
    )
  })
  it('só admin tem a tool', () => {
    expect(buildRegistry(admin).get('bonus_do_periodo')).toBeTruthy()
    expect(buildRegistry(intern).get('bonus_do_periodo')).toBeUndefined()
    expect(buildRegistry(emp).get('bonus_do_periodo')).toBeUndefined()
  })
  it('filtro por nome + período devolve a linha', async () => {
    const r = await tool.run(admin, { pessoa: 'Ana', inicio: '2026-08-01', fim: '2026-08-31' })
    expect(r.data.some((b) => b.pessoa === 'Ana' && b.titulo === 'Extra')).toBe(true)
  })
})
