import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporComentarTask.js'

describe('propor_comentar_task', () => {
  let emp, proj
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    proj = await makeProject({ name: 'Acme' })
    const { rows: etapas } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [proj.id])
    await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,'Logo','todo',0,$2)`,
      [proj.id, etapas[0].id])
  })
  it('texto vazio recusa; propose não grava', async () => {
    await expect(tool.propose(emp, { tarefa: 'Logo', texto: '   ' })).rejects.toThrow(/texto/i)
    const p = await tool.propose(emp, { projeto: 'Acme', tarefa: 'Logo', texto: 'olha isso' })
    expect(p.kind).toBe('comentar_task')
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM task_comments')
    expect(rows[0].n).toBe(0)
  })
  it('execute insere comment + activity comment_added', async () => {
    const { payload } = await tool.propose(emp, { tarefa: 'Logo', texto: 'olha isso' })
    await tool.execute(emp, payload)
    const { rows: c } = await query('SELECT body FROM task_comments')
    expect(c[0].body).toBe('olha isso')
    const { rows: a } = await query(`SELECT type FROM task_activity WHERE type = 'comment_added'`)
    expect(a).toHaveLength(1)
  })
})
