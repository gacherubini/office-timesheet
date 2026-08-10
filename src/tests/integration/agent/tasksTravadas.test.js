import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/tasksTravadas.js'

async function makeTask({ project_id, title, status, updatedDaysAgo = 0 }) {
  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, status, position, updated_at)
     VALUES ($1,$2,$3,0, now() - ($4 || ' days')::interval) RETURNING id`,
    [project_id, title, status, String(updatedDaysAgo)],
  )
  return rows[0].id
}

describe('tool tasks_travadas (todos os papéis)', () => {
  let emp, proj
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    proj = await makeProject({ name: 'P' })
    await makeTask({ project_id: proj.id, title: 'Revisão velha', status: 'in_review', updatedDaysAgo: 10 })
    await makeTask({ project_id: proj.id, title: 'Revisão nova', status: 'in_review', updatedDaysAgo: 1 })
    await makeTask({ project_id: proj.id, title: 'Largada', status: 'abandoned', updatedDaysAgo: 0 })
    await makeTask({ project_id: proj.id, title: 'Tocando', status: 'in_progress', updatedDaysAgo: 30 })
  })

  it('traz in_review parada há +N dias e abandoned; não traz revisão nova nem in_progress', async () => {
    const { data } = await tool.run(emp, { dias: 3 })
    const titulos = data.map((t) => t.titulo)
    expect(titulos).toContain('Revisão velha')
    expect(titulos).toContain('Largada')
    expect(titulos).not.toContain('Revisão nova')
    expect(titulos).not.toContain('Tocando')
  })

  it('coage dias stringificado ("3") pro mesmo resultado do número 3', async () => {
    const comNumero = await tool.run(emp, { dias: 3 })
    const comString = await tool.run(emp, { dias: '3' })
    expect(comString.data.map((t) => t.titulo).sort())
      .toEqual(comNumero.data.map((t) => t.titulo).sort())
  })
})
