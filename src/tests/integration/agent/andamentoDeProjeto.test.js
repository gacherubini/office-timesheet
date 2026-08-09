import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/andamentoDeProjeto.js'

describe('tool andamento_de_projeto (todos os papéis)', () => {
  let ana, proj, taskId
  beforeEach(async () => {
    await resetDb()
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    proj = await makeProject({ name: 'P' })
    const t = await query(
      `INSERT INTO tasks (project_id, title, status, position) VALUES ($1,'Tarefa X','in_progress',0) RETURNING id`,
      [proj.id],
    )
    taskId = t.rows[0].id
    // Tudo com now() → cai na semana corrente.
    await query(
      `INSERT INTO task_comments (task_id, author_id, body) VALUES ($1,$2,'oi')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_attachments (task_id, uploaded_by, file_url, file_name) VALUES ($1,$2,'u','f.png')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_activity (task_id, actor_id, type, detail) VALUES ($1,$2,'status_change','{}'::jsonb)`,
      [taskId, ana.id],
    )
  })

  it('conta comentários, anexos e atividade da semana e lista os itens de atividade', async () => {
    const { data } = await tool.run(ana, { projeto_id: proj.id, periodo: 'semana' })
    expect(data.novos_comentarios).toBe(1)
    expect(data.novos_anexos).toBe(1)
    expect(data.atividades).toBe(1)
    expect(data.itens[0].tarefa).toBe('Tarefa X')
    expect(data.itens[0].tipo).toBe('status_change')
  })
})
