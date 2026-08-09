import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import listarEquipe from '../../../lib/agent/tools/read/listarEquipe.js'

describe('tool listar_equipe — paridade com GET /users', () => {
  let admin, intern, employee, pm
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Admin', hourly_rate: 200 })
    intern = await makeUser({ role: 'administrative_intern', name: 'Estag', hourly_rate: 0 })
    employee = await makeUser({ role: 'employee', name: 'Colab', hourly_rate: 100 })
    pm = await makeUser({ role: 'project_manager', name: 'Gestor', hourly_rate: 150 })
  })

  it('admin: tool e endpoint devolvem os mesmos ids E as mesmas chaves', async () => {
    const tool = await listarEquipe.run(admin, {})
    const endpoint = await asUser(admin).get('/admin/users')
    expect(endpoint.status).toBe(200)

    const idsTool = tool.data.map((r) => r.id).sort()
    const idsEnd = endpoint.body.map((r) => r.id).sort()
    expect(idsTool).toEqual(idsEnd)

    const keysTool = Object.keys(tool.data[0]).sort()
    const keysEnd = Object.keys(endpoint.body[0]).sort()
    expect(keysTool).toEqual(keysEnd)
    expect(keysTool).toContain('hourly_rate') // sanidade: admin vê dinheiro
  })

  it('estagiário: mesmas linhas do admin, mas SEM as colunas de dinheiro', async () => {
    const tool = await listarEquipe.run(intern, {})
    const endpoint = await asUser(intern).get('/admin/users')
    expect(endpoint.status).toBe(200)

    expect(tool.data.map((r) => r.id).sort()).toEqual(endpoint.body.map((r) => r.id).sort())
    const keysTool = Object.keys(tool.data[0]).sort()
    expect(keysTool).toEqual(Object.keys(endpoint.body[0]).sort())
    // É ESTA asserção que pega a query do admin reusada por outro papel:
    expect(keysTool).not.toContain('hourly_rate')
    expect(keysTool).not.toContain('fixed_salary')
  })

  it('colaborador e gestor: a tool não devolve linha nenhuma (rows = false)', async () => {
    expect((await listarEquipe.run(employee, {})).count).toBe(0)
    expect((await listarEquipe.run(pm, {})).count).toBe(0)
    // E o endpoint espelhado nega o acesso a esses papéis:
    expect((await asUser(employee).get('/admin/users')).status).toBe(403)
    expect((await asUser(pm).get('/admin/users')).status).toBe(403)
  })
})
