import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/feriasEConflitos.js'

async function ferias(userId, ini, fim) {
  await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
     VALUES ($1,$2,$3,$4,'approved')`,
    [userId, ini, fim, 5],
  )
}

describe('tool ferias_e_conflitos (todos os papéis)', () => {
  let emp, ana, bruno, carla
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Quem pergunta' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    carla = await makeUser({ role: 'employee', name: 'Carla' })
    // Ana e Bruno se sobrepõem; Carla não.
    await ferias(ana.id, '2026-08-10', '2026-08-20')
    await ferias(bruno.id, '2026-08-18', '2026-08-25')
    await ferias(carla.id, '2026-09-01', '2026-09-05')
  })

  it('lista as férias do mês e aponta a sobreposição Ana×Bruno', async () => {
    const { data } = await tool.run(emp, { periodo: 'mes' })
    // Nota: o teste usa datas de ago/2026; rode com o relógio do CI/local.
    const nomes = data.ferias.map((f) => f.pessoa)
    expect(nomes).toContain('Ana')
    expect(nomes).toContain('Bruno')
    const par = data.conflitos.map((c) => [c.pessoa_a, c.pessoa_b].sort().join('×'))
    expect(par).toContain('Ana×Bruno')
  })
})
