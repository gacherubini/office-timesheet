import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/statusProjeto.js'

async function makeTask({ project_id, title, status }) {
  await query(
    `INSERT INTO tasks (project_id, title, status, position) VALUES ($1,$2,$3,0)`,
    [project_id, title, status],
  )
}

describe('tool status_projeto (todos os papéis)', () => {
  let emp, proj
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    proj = await makeProject({ name: 'Projeto A', status: 'active' })
    await makeTask({ project_id: proj.id, title: 'T1', status: 'todo' })
    await makeTask({ project_id: proj.id, title: 'T2', status: 'in_review' })
    await makeTask({ project_id: proj.id, title: 'T3', status: 'done' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 120, 0)`,
      [emp.id, proj.id],
    )
  })

  it('retrata o projeto: status, tarefas por coluna e horas apontadas', async () => {
    const { data } = await tool.run(emp, { projeto: 'Projeto A' })
    expect(data).toHaveLength(1)
    const p = data[0]
    expect(p.projeto).toBe('Projeto A')
    // O id sai no resultado para o modelo poder encadear com outras tools.
    expect(p.projeto_id).toBe(proj.id)
    expect(p.status).toBe('active')
    expect(p.tarefas.todo).toBe(1)
    expect(p.tarefas.in_review).toBe(1)
    expect(p.tarefas.done).toBe(1)
    expect(p.tarefas.total).toBe(3)
    expect(p.total_horas).toBe(2) // 120 min, sem inflar por causa das 3 tarefas
  })

  it('sem nome de projeto, traz todos os ativos', async () => {
    await makeProject({ name: 'Projeto B', status: 'active' })
    const { data } = await tool.run(emp, {})
    expect(data.map((p) => p.projeto).sort()).toEqual(['Projeto A', 'Projeto B'])
  })

  it('nome ambíguo vira pergunta, não resposta errada', async () => {
    await makeProject({ name: 'Projeto A2', status: 'active' })
    await expect(tool.run(emp, { projeto: 'Projeto A' })).rejects.toThrow(/mais de um|especifique/i)
  })

  it('nome inexistente vira erro legível (nunca erro cru de uuid)', async () => {
    await expect(tool.run(emp, { projeto: 'Nada' })).rejects.toThrow(/não encontrei/i)
  })
})
