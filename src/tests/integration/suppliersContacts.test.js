import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('API de fornecedores — contatos múltiplos e PF/PJ', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
  })

  it('fornecedor PJ com e-mail comercial e de nota fiscal', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      person_type: 'pj',
      razao_social: 'Marcenaria Alfa Ltda',
      nome_fantasia: 'Marcenaria Alfa',
      cnpj: '22.222.222/0001-22',
      emails: [
        { label: 'comercial', value: 'vendas@alfa.com', is_primary: true },
        { label: 'financeiro / nota fiscal', value: 'nf@alfa.com' },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Marcenaria Alfa')

    const ficha = await asUser(admin).get(`/admin/suppliers/${res.body.id}`)
    expect(ficha.body.emails).toHaveLength(2)
    expect(ficha.body.emails.find((e) => e.is_primary).label).toBe('comercial')
  })

  it('guarda os dados bancários do fornecedor', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      name: 'Zé Marceneiro',
      bank_name: 'Itaú', bank_agency: '1234', bank_account: '56789-0',
      bank_account_type: 'corrente', pix_key: 'ze@x.com',
    })
    const ficha = await asUser(admin).get(`/admin/suppliers/${res.body.id}`)
    expect(ficha.body.bank_name).toBe('Itaú')
    expect(ficha.body.pix_key).toBe('ze@x.com')
  })

  it('a listagem traz o contato principal', async () => {
    await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      phones: [{ label: 'comercial', value: '1133330000', is_primary: true }],
    })
    const lista = await asUser(admin).get('/admin/suppliers')
    expect(lista.body.find((s) => s.name === 'Marcenaria').primary_phone).toBe('1133330000')
  })

  it('recusa dois principais', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      emails: [{ label: 'a', value: 'a@b.c', is_primary: true }, { label: 'b', value: 'd@e.f', is_primary: true }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um e-mail/i)
  })

  it('PUT substitui as listas', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      phones: [{ label: 'comercial', value: '1' }, { label: 'celular', value: '2' }],
    })
    await asUser(admin).put(`/admin/suppliers/${criado.body.id}`).send({
      name: 'Marcenaria', phones: [{ label: 'WhatsApp', value: '3' }],
    })
    const ficha = await asUser(admin).get(`/admin/suppliers/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
  })

  it('colaborador não vê ficha de fornecedor restrito', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({ name: 'Sigiloso', admin_only: true })
    const res = await asUser(emp).get(`/admin/suppliers/${criado.body.id}`)
    expect(res.status).toBe(404)
  })

  it('PJ sem razão social é recusada', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({ person_type: 'pj', nome_fantasia: 'X' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/razão social/i)
  })
})
