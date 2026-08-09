import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/cargaEquipe.js'

describe('tool carga_equipe (admin)', () => {
  let admin, ana, bruno, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    proj = await makeProject({ name: 'P' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 180, 0)`,
      [ana.id, proj.id],
    )
    await query(
      `INSERT INTO tasks (project_id, title, status, assignee_id, position)
       VALUES ($1,'T1','in_progress',$2,0)`,
      [proj.id, ana.id],
    )
  })

  it('mostra horas, apontamentos e tarefas abertas por pessoa', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const a = data.find((p) => p.pessoa === 'Ana')
    expect(a.total_horas).toBe(3)
    expect(a.apontamentos).toBe(1)
    expect(a.tarefas_abertas).toBe(1)
    const b = data.find((p) => p.pessoa === 'Bruno')
    expect(b.total_horas).toBe(0)
    expect(data[0].pessoa).toBe('Ana') // ordenado por horas desc
  })
})
