import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporCriarTask.js'

describe('tool propor_criar_task', () => {
  let emp, projeto
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    projeto = await makeProject({ name: 'Acme' })
  })

  it('propose descreve criar a tarefa no projeto resolvido pelo nome', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'Revisar layout' })
    expect(p.kind).toBe('criar_task')
    expect(p.payload.project_id).toBe(projeto.id)
    expect(p.payload.title).toBe('Revisar layout')
    expect(p.payload.priority).toBe('medium') // default espelhado do endpoint
    expect(p.descricao).toMatch(/Revisar layout/)
    // propose NÃO muta.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1', [projeto.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose sem título → erro legível (título obrigatório)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: '   ' })).rejects.toThrow(/título/i)
  })

  it('propose com prioridade inválida → erro (low/medium/high)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X', prioridade: 'urgente' }))
      .rejects.toThrow(/prioridade/i)
  })

  it('propose com projeto inexistente → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Nada', titulo: 'X' })).rejects.toThrow(/não encontrei/i)
  })

  it('execute cria a task no fim da coluna todo e devolve antes/depois', async () => {
    // Já existe uma task em todo → a nova entra na position seguinte.
    await query(
      `INSERT INTO tasks (project_id, title, status, position, created_by) VALUES ($1,'T0','todo',0,$2)`,
      [projeto.id, emp.id],
    )
    const { before, after } = await tool.execute(emp, { project_id: projeto.id, title: 'Nova', priority: 'high' })
    expect(before).toBeNull()
    expect(after.title).toBe('Nova')
    expect(after.status).toBe('todo')
    expect(after.priority).toBe('high')
    expect(after.position).toBe(1)
    expect(after.created_by).toBe(emp.id)
  })

  it('execute registra o histórico "created", igual à rota espelhada', async () => {
    const { after } = await tool.execute(emp, { project_id: projeto.id, title: 'Com histórico', priority: 'medium' })
    const { rows } = await query(
      `SELECT type, actor_id, detail FROM task_activity WHERE task_id = $1`,
      [after.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('created')
    expect(rows[0].actor_id).toBe(emp.id)
    expect(rows[0].detail).toEqual({ title: 'Com histórico' })
  })

  it('execute revalida: projeto sumiu entre propor e aprovar → recusa', async () => {
    await query('DELETE FROM projects WHERE id = $1', [projeto.id])
    await expect(tool.execute(emp, { project_id: projeto.id, title: 'X', priority: 'medium' }))
      .rejects.toThrow(/projeto/i)
  })
})
