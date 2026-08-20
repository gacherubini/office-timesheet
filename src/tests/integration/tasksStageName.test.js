// Item 3 do brief de 19/08/2026: TaskCard precisa mostrar a etapa da
// tarefa. task.stage_id já vinha em GET /tasks, mas o NOME da etapa não —
// e é mais barato trazer no SELECT (join com project_stages) do que
// resolver no front.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeProject } from '../helpers/factories.js'

describe('GET /tasks — nome da etapa', () => {
  let admin, projeto, etapa

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    projeto = await makeProject({ name: 'Obra 1' })
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Anteprojeto',0) RETURNING id`,
      [projeto.id])
    etapa = rows[0].id
    await asUser(admin).post(`/projects/${projeto.id}/tasks`).send({ title: 'Planta baixa', stage_id: etapa })
  })

  it('devolve stage_name junto com stage_id', async () => {
    const res = await asUser(admin).get('/tasks').query({ project_id: projeto.id })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].stage_id).toBe(etapa)
    expect(res.body[0].stage_name).toBe('Anteprojeto')
  })
})
