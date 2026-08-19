import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/statusProjeto.js'

async function makeTask({ project_id, title, status, stage_id }) {
  await query(
    `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,$2,$3,0,$4)`,
    [project_id, title, status, stage_id],
  )
}

describe('tool status_projeto (todos os papéis)', () => {
  let emp, proj, etapa
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    proj = await makeProject({ name: 'Projeto A', status: 'active' })
    const { rows: etapas } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [proj.id])
    etapa = etapas[0].id
    await makeTask({ project_id: proj.id, title: 'T1', status: 'todo', stage_id: etapa })
    await makeTask({ project_id: proj.id, title: 'T2', status: 'in_review', stage_id: etapa })
    await makeTask({ project_id: proj.id, title: 'T3', status: 'done', stage_id: etapa })
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
    // Colaborador vê as horas DELE (os 120 min são dele), com a chave que diz
    // isso — o agregado do time nem entra no JSON. Ver paridadeLinha.test.js.
    expect(p.minhas_horas).toBe(2) // 120 min, sem inflar por causa das 3 tarefas
    expect(p.escopo_horas).toBe('proprio')
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

  it('com período, conta só as horas apontadas na janela', async () => {
    // O fixture já tem 120 min de hoje. Este é de um ano atrás:
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now() - interval '1 year', now() - interval '1 year', 'completed', 600, 0)`,
      [emp.id, proj.id],
    )

    const semPeriodo = await tool.run(emp, { projeto: 'Projeto A' })
    expect(semPeriodo.data[0].minhas_horas).toBe(12) // 120 + 600 min
    expect(semPeriodo.data[0].periodo).toBeNull()

    const comPeriodo = await tool.run(emp, { projeto: 'Projeto A', periodo: 'mes' })
    expect(comPeriodo.data[0].minhas_horas).toBe(2) // só os 120 min deste mês
    expect(comPeriodo.data[0].periodo).toEqual(expect.objectContaining({ inicio: expect.any(String) }))
  })

  it('admin soma o projeto inteiro; o colaborador, só o que é dele', async () => {
    const admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1,$2, now(), now(), 'completed', 60, 0)`,
      [admin.id, proj.id],
    )
    const visaoAdmin = await tool.run(admin, { projeto: 'Projeto A' })
    expect(visaoAdmin.data[0].total_horas).toBe(3) // 120 do colaborador + 60 do admin
    expect(visaoAdmin.data[0].escopo_horas).toBe('equipe')

    const visaoColaborador = await tool.run(emp, { projeto: 'Projeto A' })
    expect(visaoColaborador.data[0].minhas_horas).toBe(2)
  })
})
