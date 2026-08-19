// GET /admin/clients/:id e GET /admin/suppliers/:id carregam a lista de campos
// restritos só para filtrar a resposta, e a descartavam — o admin não tinha
// como saber o que estava marcado, e um PUT subsequente (com o palpite padrão
// do front) revertia a marcação em silêncio. Ver docs/pendencias-go-live.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('GET /admin/clients/:id devolve restricted_fields', () => {
  let admin, emp, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano', cpf: '123.456.789-00', rg: '12.345.678-9', notes: 'observação',
    })
    cliente = res.body.id
    // Admin ajusta a mão: libera o RG, restringe as observações.
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', cpf: '123.456.789-00', restricted_fields: ['cpf', 'notes'],
    })
  })

  it('admin recebe restricted_fields com os campos gravados no PUT', async () => {
    const res = await asUser(admin).get(`/admin/clients/${cliente}`)
    expect(res.body.restricted_fields).toEqual(expect.arrayContaining(['cpf', 'notes']))
    expect(res.body.restricted_fields).not.toContain('rg')
  })

  it('não-admin não recebe a chave restricted_fields', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.status).toBe(200)
    expect('restricted_fields' in res.body).toBe(false)
  })
})

describe('GET /admin/suppliers/:id devolve restricted_fields', () => {
  let admin, emp, fornecedor
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteto' })
    const res = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', cnpj: '12.345.678/0001-90', pix_key: 'nf@marcenaria.com',
    })
    fornecedor = res.body.id
    await asUser(admin).put(`/admin/suppliers/${fornecedor}`).send({
      name: 'Marcenaria', cnpj: '12.345.678/0001-90', restricted_fields: ['cnpj', 'notes'],
    })
  })

  it('admin recebe restricted_fields com os campos gravados no PUT', async () => {
    const res = await asUser(admin).get(`/admin/suppliers/${fornecedor}`)
    expect(res.body.restricted_fields).toEqual(expect.arrayContaining(['cnpj', 'notes']))
    expect(res.body.restricted_fields).not.toContain('pix_key')
  })

  it('não-admin não recebe a chave restricted_fields', async () => {
    const res = await asUser(emp).get(`/admin/suppliers/${fornecedor}`)
    expect(res.status).toBe(200)
    expect('restricted_fields' in res.body).toBe(false)
  })
})
