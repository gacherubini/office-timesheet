import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { validarContexto } from '../../../lib/agent/contextoTela.js'

describe('validarContexto', () => {
  let user, acme, outro
  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'employee' })
    acme = await makeProject({ name: 'Acme' })
    outro = await makeProject({ name: 'Outro' })
    await query(`INSERT INTO tasks (project_id, title, status, position) VALUES ($1,'Logo','todo',0)`, [acme.id])
  })

  it('id válido devolve nome do banco', async () => {
    const ctx = await validarContexto(user, { project_id: acme.id })
    expect(ctx.projeto.name).toBe('Acme')
    expect(ctx.projeto.taskCount).toBe(1)
  })
  it('uuid lixo é ignorado, sem throw', async () => {
    const ctx = await validarContexto(user, { project_id: 'nao-e-uuid' })
    expect(ctx.projeto).toBeNull()
  })
  it('id inexistente é ignorado', async () => {
    const ctx = await validarContexto(user, { project_id: '11111111-1111-4111-8111-111111111111' })
    expect(ctx.projeto).toBeNull()
  })
  it('projeto deletado some', async () => {
    await query('UPDATE projects SET deleted_at = now() WHERE id = $1', [acme.id])
    const ctx = await validarContexto(user, { project_id: acme.id })
    expect(ctx.projeto).toBeNull()
  })
  it('task de outro project_id ganha: o projeto passa a ser o da task', async () => {
    const { rows } = await query('SELECT id FROM tasks WHERE title = $1', ['Logo'])
    const ctx = await validarContexto(user, { project_id: outro.id, task_id: rows[0].id })
    expect(ctx.tarefa.title).toBe('Logo')
    expect(ctx.projeto.id).toBe(acme.id)
    expect(ctx.projeto.name).toBe('Acme')
  })
})
