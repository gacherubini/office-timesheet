import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporEncerrarApontamento.js'

async function startedMinutesAgo(userId, projectId, minutes) {
  const { rows } = await query(
    `INSERT INTO time_entries (user_id, project_id, started_at, status)
     VALUES ($1, $2, now() - ($3 || ' minutes')::interval, 'running') RETURNING id`,
    [userId, projectId, String(minutes)],
  )
  return rows[0].id
}

describe('tool propor_encerrar_apontamento', () => {
  let emp, project
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', hourly_rate: 120 })
    project = await makeProject({ name: 'Projeto X' })
  })

  it('propose descreve o apontamento aberto do próprio usuário', async () => {
    const entryId = await startedMinutesAgo(emp.id, project.id, 90)
    const p = await tool.propose(emp, {})
    expect(p.kind).toBe('encerrar_apontamento')
    expect(p.payload.entry_id).toBe(entryId)
    expect(p.descricao).toMatch(/Projeto X/)
  })

  it('propose sem apontamento aberto → erro legível (não vira proposta)', async () => {
    await expect(tool.propose(emp, {})).rejects.toThrow(/nenhum apontamento aberto/i)
  })

  it('execute encerra e devolve antes/depois', async () => {
    const entryId = await startedMinutesAgo(emp.id, project.id, 60)
    const { before, after } = await tool.execute(emp, { entry_id: entryId })
    expect(before.status).toBe('running')
    expect(after.status).toBe('completed')
    expect(after.duration_minutes).toBeGreaterThan(0)

    const { rows } = await query('SELECT status FROM time_entries WHERE id = $1', [entryId])
    expect(rows[0].status).toBe('completed')
  })

  it('execute nega apontamento de outro usuário (revalidação de dono)', async () => {
    const outro = await makeUser({ role: 'employee' })
    const entryId = await startedMinutesAgo(outro.id, project.id, 30)
    await expect(tool.execute(emp, { entry_id: entryId })).rejects.toThrow()
    const { rows } = await query('SELECT status FROM time_entries WHERE id = $1', [entryId])
    expect(rows[0].status).toBe('running') // intacto
  })
})
