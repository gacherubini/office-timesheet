import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporEditarTask.js'

describe('propor_editar_task', () => {
  let emp, ana, taskId
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Bruno' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Acme' })
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, status, position, priority) VALUES ($1,'Logo','todo',0,'medium') RETURNING id`,
      [proj.id],
    )
    taskId = rows[0].id
  })
  it('sem campo de mudança recusa; título vazio recusa', async () => {
    await expect(tool.propose(emp, { tarefa: 'Logo' })).rejects.toThrow(/campo|mudar|alter/i)
    await expect(tool.propose(emp, { tarefa: 'Logo', titulo: '   ' })).rejects.toThrow(/título/i)
  })
  it('responsável por nome; desatribuir; activity + notificação', async () => {
    const { payload } = await tool.propose(emp, { tarefa: 'Logo', responsavel: 'Ana' })
    await tool.execute(emp, payload)
    const { rows } = await query('SELECT assignee_id FROM tasks WHERE id = $1', [taskId])
    expect(rows[0].assignee_id).toBe(ana.id)
    const { rows: n } = await query(`SELECT type FROM notifications WHERE type = 'task_assigned' AND user_id = $1`, [ana.id])
    expect(n.length).toBeGreaterThanOrEqual(1)
    const { payload: p2 } = await tool.propose(emp, { tarefa: 'Logo', responsavel: '' })
    await tool.execute(emp, p2)
    const { rows: after } = await query('SELECT assignee_id FROM tasks WHERE id = $1', [taskId])
    expect(after[0].assignee_id).toBeNull()
  })
  it('prazo só aceita YYYY-MM-DD real; vazio limpa', async () => {
    await expect(tool.propose(emp, { tarefa: 'Logo', prazo: 'amanhã' })).rejects.toThrow(/prazo inválido/i)
    await expect(tool.propose(emp, { tarefa: 'Logo', prazo: '20/08' })).rejects.toThrow(/prazo inválido/i)
    await expect(tool.propose(emp, { tarefa: 'Logo', prazo: '2026-02-31' })).rejects.toThrow(/prazo inválido/i)
    const ok = await tool.propose(emp, { tarefa: 'Logo', prazo: '2026-08-20' })
    expect(ok.payload.due_date).toBe('2026-08-20')
    const limpa = await tool.propose(emp, { tarefa: 'Logo', prazo: '' })
    expect(limpa.payload.due_date).toBeNull()
  })
})
