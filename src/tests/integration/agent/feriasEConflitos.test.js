import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/feriasEConflitos.js'

// Datas ancoradas no now() do banco (em vez de literais fixos) pra o teste não
// virar bomba-relógio quando o mês corrente deixar de ser o do literal.
// monthOffset desloca o mês-base; diaIni/diaFim são offsets em dias a partir
// do dia 1 desse mês.
async function ferias(userId, monthOffset, diaIni, diaFim) {
  await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
     VALUES ($1,
             (date_trunc('month', now()) + ($2 || ' months')::interval + ($3 || ' days')::interval)::date,
             (date_trunc('month', now()) + ($2 || ' months')::interval + ($4 || ' days')::interval)::date,
             $5, 'approved')`,
    [userId, monthOffset, diaIni, diaFim, 5],
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
    // Ana e Bruno se sobrepõem dentro do mês corrente; Carla cai no mês seguinte.
    await ferias(ana.id, 0, 9, 19) // dia 10 ao dia 20 do mês corrente
    await ferias(bruno.id, 0, 17, 24) // dia 18 ao dia 25 do mês corrente
    await ferias(carla.id, 1, 0, 4) // dia 1 ao dia 5 do mês seguinte
  })

  it('lista as férias do mês e aponta a sobreposição Ana×Bruno', async () => {
    const { data } = await tool.run(emp, { periodo: 'mes' })
    const nomes = data.ferias.map((f) => f.pessoa)
    expect(nomes).toContain('Ana')
    expect(nomes).toContain('Bruno')
    const par = data.conflitos.map((c) => [c.pessoa_a, c.pessoa_b].sort().join('×'))
    expect(par).toContain('Ana×Bruno')
    // Datas do payload vêm formatadas dd/mm/aaaa, não ISO cru.
    for (const f of data.ferias) {
      expect(f.inicio).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      expect(f.fim).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    }
  })
})
