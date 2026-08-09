import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/simulacaoPerformance.js'

// YYYY-MM do mês atual no fuso do estúdio — casa com o default da tool.
function ymAtual() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(new Date())
}

describe('tool simulacao_performance (todos os papéis, dado próprio)', () => {
  let ana, bruno, proj, ym
  beforeEach(async () => {
    await resetDb()
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    ym = ymAtual()
    // Ana: planejou 600 min (10h) para o mês e já apontou 180 min (3h) concluídos.
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [ana.id, ym, JSON.stringify({ target_amount: 5000, overrides: { [`${ym}-15`]: 600 } })],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', 180, 0)`,
      [ana.id, proj.id],
    )
    // Bruno tem a própria simulação — não deve vazar para a da Ana.
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [bruno.id, ym, JSON.stringify({ target_amount: 9999, overrides: { [`${ym}-10`]: 120 } })],
    )
  })

  it('devolve a simulação do PRÓPRIO usuário: meta, horas planejadas e horas reais', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.mes).toBe(ym)
    expect(data.meta_ganho).toBe(5000)
    expect(data.horas_planejadas).toBe(10)
    expect(data.horas_realizadas).toBe(3)
    expect(data.tem_simulacao).toBe(true)
  })

  it('não vaza a simulação de outra pessoa', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.meta_ganho).not.toBe(9999)
  })
})
