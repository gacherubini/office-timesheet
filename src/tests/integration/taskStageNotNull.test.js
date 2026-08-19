// 051 — "toda tarefa pertence a uma etapa" também no banco: stage_id fica
// NOT NULL e task_type (substituída por stage_id nas migrations 047-049) sai
// de vez da tabela.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

describe('051 — etapa obrigatória no banco', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Obra' })
  })

  it('o banco recusa tarefa sem etapa', async () => {
    await expect(
      query(`INSERT INTO tasks (project_id, title) VALUES ($1,'Órfã')`, [projeto.id]),
    ).rejects.toThrow(/null value in column "stage_id"/)
  })

  it('a coluna task_type não existe mais', async () => {
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'task_type'`)
    expect(rows).toHaveLength(0)
  })
})
