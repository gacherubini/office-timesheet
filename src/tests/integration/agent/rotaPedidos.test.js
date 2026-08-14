import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { insert } from '../../../lib/agent/featureRequestsRepo.js'

describe('rotas admin de pedidos não atendidos', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee' })
  })

  it('403 para não-admin na listagem', async () => {
    expect((await asUser(emp).get('/admin/agent/feature-requests')).status).toBe(403)
  })

  it('lista os pedidos', async () => {
    await insert({ userId: emp.id, role: emp.role, descricao: 'exportar para Excel' })
    const res = await asUser(admin).get('/admin/agent/feature-requests')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].descricao).toBe('exportar para Excel')
  })

  it('PATCH muda o status', async () => {
    const { id } = await insert({ userId: emp.id, role: emp.role, descricao: 'x' })
    const res = await asUser(admin).patch(`/admin/agent/feature-requests/${id}`).send({ status: 'feito' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('feito')
  })

  it('status inválido → 400', async () => {
    const { id } = await insert({ userId: emp.id, role: emp.role, descricao: 'x' })
    expect((await asUser(admin).patch(`/admin/agent/feature-requests/${id}`).send({ status: 'lixo' })).status).toBe(400)
  })

  it('id inexistente → 404', async () => {
    const res = await asUser(admin).patch('/admin/agent/feature-requests/00000000-0000-0000-0000-000000000000').send({ status: 'feito' })
    expect(res.status).toBe(404)
  })
})
