import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('visibilidade por campo — clientes', () => {
  let admin, emp, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano', cpf: '123.456.789-00', rg: '12.345.678-9', notes: 'observação',
    })
    cliente = res.body.id
  })

  // "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários."
  it('cliente novo nasce com CPF e RG restritos', async () => {
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1 ORDER BY field_name`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(expect.arrayContaining(['cpf', 'rg', 'cnpj']))
  })

  it('admin vê o CPF na ficha', async () => {
    const res = await asUser(admin).get(`/admin/clients/${cliente}`)
    expect(res.body.cpf).toBe('123.456.789-00')
  })

  // O aceite literal do PDF.
  it('colaborador não recebe a chave cpf', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.status).toBe(200)
    expect('cpf' in res.body).toBe(false)
    expect('rg' in res.body).toBe(false)
  })

  it('colaborador recebe os campos não restritos', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.name).toBe('Fulano')
    expect(res.body.notes).toBe('observação')
  })

  it('a LISTAGEM também filtra', async () => {
    const res = await asUser(emp).get('/admin/clients')
    const item = res.body.find((c) => c.name === 'Fulano')
    expect('cpf' in item).toBe(false)
  })

  it('a listagem do admin não filtra', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.body.find((c) => c.name === 'Fulano').cpf).toBe('123.456.789-00')
  })

  it('admin libera um campo e o colaborador passa a ver', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', cpf: '123.456.789-00', restricted_fields: ['rg'],
    })
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.cpf).toBe('123.456.789-00')
    expect('rg' in res.body).toBe(false)
  })

  it('colaborador não pode alterar a marcação', async () => {
    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', restricted_fields: [],
    })
    expect(res.status).toBe(403)
  })

  it('campo fora da allowlist é ignorado na marcação', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', restricted_fields: ['name', 'cpf'],
    })
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.name).toBe('Fulano')
    expect('cpf' in res.body).toBe(false)
  })

  it('telefone restrito não aparece; os outros sim', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'celular','111',true,false), ($1,'recado','222',false,true)`, [cliente])
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.phones).toHaveLength(1)
    expect(res.body.phones[0].value).toBe('111')
  })

  it('se o principal era restrito, o colaborador vê o próximo como principal', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'pessoal','111',true,true), ($1,'comercial','222',false,false)`, [cliente])
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.phones).toHaveLength(1)
    expect(res.body.phones[0].is_primary).toBe(true)
    expect(res.body.phones[0].value).toBe('222')
  })
})
