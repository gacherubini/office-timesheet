import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporMoverTask.js'

describe('propor_mover_task', () => {
  let emp, taskId
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    const proj = await makeProject({ name: 'Acme' })
    const { rows: etapas } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [proj.id])
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,'Logo','todo',0,$2) RETURNING id`,
      [proj.id, etapas[0].id],
    )
    taskId = rows[0].id
  })
  it('enum inválido recusa', async () => {
    await expect(tool.propose(emp, { tarefa: 'Logo', status: 'flying' })).rejects.toThrow(/status/i)
  })
  it('done preenche completed_at e activity status_changed', async () => {
    const { payload } = await tool.propose(emp, { tarefa: 'Logo', status: 'done' })
    expect(payload).toMatchObject({ status: 'done' })
    await tool.execute(emp, payload)
    const { rows } = await query('SELECT status, completed_at FROM tasks WHERE id = $1', [taskId])
    expect(rows[0].status).toBe('done')
    expect(rows[0].completed_at).toBeTruthy()
    const { rows: a } = await query(`SELECT type FROM task_activity WHERE type = 'status_changed'`)
    expect(a).toHaveLength(1)
  })
})
