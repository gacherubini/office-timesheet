import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/quemNaoApontou.js'

describe('tool quem_nao_apontou (admin)', () => {
  let admin, ana, bruno, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    // Só a Ana apontou; Bruno e o Chefe não.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 60, 0)`,
      [ana.id, proj.id],
    )
  })

  it('apontamento das 22h no fuso SP conta como HOJE: pessoa some da lista', async () => {
    // 22h de HOJE em SP = 01h de AMANHÃ em UTC. Com a data nua (UTC) o apontamento
    // ficaria fora do dia e Carla apareceria como "não apontou" — errado.
    const carla = await makeUser({ role: 'employee', name: 'Carla' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2,
         (((now() AT TIME ZONE 'America/Sao_Paulo')::date + time '22:00') AT TIME ZONE 'America/Sao_Paulo'),
         now(), 'completed', 60, 0)`,
      [carla.id, proj.id],
    )
    const { data } = await tool.run(admin, { periodo: 'hoje' })
    expect(data.map((d) => d.pessoa)).not.toContain('Carla')
  })

  it('lista os ativos sem apontamento concluído no período', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const nomes = data.map((d) => d.pessoa)
    expect(nomes).toContain('Bruno')
    expect(nomes).toContain('Chefe')
    expect(nomes).not.toContain('Ana')
  })
})
