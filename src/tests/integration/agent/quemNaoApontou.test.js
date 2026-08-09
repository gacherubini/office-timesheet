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

  it('lista os ativos sem apontamento concluído no período', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const nomes = data.map((d) => d.pessoa)
    expect(nomes).toContain('Bruno')
    expect(nomes).toContain('Chefe')
    expect(nomes).not.toContain('Ana')
  })
})
