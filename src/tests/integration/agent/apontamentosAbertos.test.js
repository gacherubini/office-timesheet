import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/apontamentosAbertos.js'

describe('tool apontamentos_abertos (admin + estagiário)', () => {
  let admin, ana, bruno, carla, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    carla = await makeUser({ role: 'employee', name: 'Carla' })
    proj = await makeProject({ name: 'Acme' })
    // Ana está rodando há 2h; Bruno está pausado; Carla já encerrou.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '2 hours', 'running')`,
      [ana.id, proj.id],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '30 minutes', 'paused')`,
      [bruno.id, proj.id],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now() - interval '5 hours', now(), 'completed', 60, 0)`,
      [carla.id, proj.id],
    )
  })

  it('lista só quem está com o timer aberto (running ou paused)', async () => {
    const { data, count } = await tool.run(admin, {})
    expect(count).toBe(2)
    const nomes = data.map((r) => r.pessoa).sort()
    expect(nomes).toEqual(['Ana', 'Bruno'])
    expect(nomes).not.toContain('Carla')
  })

  it('traz projeto, status e há quanto tempo está aberto', async () => {
    const { data } = await tool.run(admin, {})
    const linhaAna = data.find((r) => r.pessoa === 'Ana')
    expect(linhaAna.status).toBe('running')
    expect(linhaAna.projeto).toBe('Acme')
    expect(linhaAna.horas_em_aberto).toBeGreaterThanOrEqual(1.9)
    expect(linhaAna.horas_em_aberto).toBeLessThan(2.2)
  })

  it('não devolve nada de dinheiro', async () => {
    const { data } = await tool.run(admin, {})
    const chaves = Object.keys(data[0])
    expect(chaves).not.toContain('cost_snapshot')
    expect(chaves).not.toContain('hourly_rate')
  })
})
