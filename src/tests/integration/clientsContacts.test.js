import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('API de clientes — contatos múltiplos e PF/PJ', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
  })

  it('cria cliente com dois telefones e define o principal', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { label: 'comercial', value: '1133330000' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/admin/clients/${res.body.id}`)
    expect(ficha.status).toBe(200)
    expect(ficha.body.phones).toHaveLength(2)
    expect(ficha.body.phones.find((p) => p.is_primary).label).toBe('celular')
  })

  it('promove o primeiro telefone quando nenhum é marcado', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${res.body.id}`)
    expect(ficha.body.phones[0].is_primary).toBe(true)
  })

  it('recusa dois principais com mensagem legível', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '1', is_primary: true },
        { label: 'comercial', value: '2', is_primary: true },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um telefone/i)
    // Nada foi gravado: a validação acontece ANTES de abrir a transação.
    const { rows } = await query(`SELECT count(*)::int AS c FROM clients`)
    expect(rows[0].c).toBe(0)
  })

  it('a listagem traz o contato principal, não a lista inteira', async () => {
    await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '11999990000', is_primary: true },
               { label: 'comercial', value: '1133330000' }],
      emails: [{ label: 'pessoal', value: 'a@b.c' }],
    })
    const lista = await asUser(admin).get('/admin/clients')
    const item = lista.body.find((c) => c.name === 'Fulano')
    expect(item.primary_phone).toBe('11999990000')
    expect(item.primary_email).toBe('a@b.c')
    expect(item.phones).toBeUndefined()
  })

  it('PUT substitui as listas inteiras, em transação', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
    })
    await asUser(admin).put(`/admin/clients/${criado.body.id}`).send({
      name: 'Fulano',
      phones: [{ label: 'WhatsApp', value: '3' }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
    expect(ficha.body.phones[0].label).toBe('WhatsApp')
  })

  // Um PUT que falha no meio não pode deixar o cliente sem telefone nenhum.
  it('PUT inválido não apaga os contatos que já existiam', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }],
    })
    const res = await asUser(admin).put(`/admin/clients/${criado.body.id}`).send({
      name: 'Fulano',
      phones: [{ label: '', value: '9' }],
    })
    expect(res.status).toBe(400)
    const ficha = await asUser(admin).get(`/admin/clients/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
    expect(ficha.body.phones[0].value).toBe('1')
  })

  it('cria PJ e o nome de exibição vem do nome fantasia', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora Alfa Ltda',
      nome_fantasia: 'Alfa',
      cnpj: '11.111.111/0001-11',
    })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Alfa')
  })

  it('PJ sem nome fantasia usa a razão social como nome', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora Beta Ltda',
    })
    expect(res.body.name).toBe('Construtora Beta Ltda')
  })

  it('PJ sem razão social é recusada com mensagem, não com erro de constraint', async () => {
    const res = await asUser(admin).post('/admin/clients').send({ person_type: 'pj', nome_fantasia: 'Gama' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/razão social/i)
  })

  it('vincula PF a PJ e a ficha da empresa mostra os dois papéis', async () => {
    const socio = await asUser(admin).post('/admin/clients').send({ name: 'João Sócio' })
    const fin = await asUser(admin).post('/admin/clients').send({ name: 'Maria Financeiro' })
    const empresa = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora X Ltda',
      nome_fantasia: 'Construtora X',
      links: [
        { member_client_id: socio.body.id, role: 'socio' },
        { member_client_id: fin.body.id, role: 'financeiro' },
      ],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${empresa.body.id}`)
    expect(ficha.body.links).toHaveLength(2)
    expect(ficha.body.links.map((l) => l.role).sort()).toEqual(['financeiro', 'socio'])
    expect(ficha.body.links.map((l) => l.member_name)).toContain('João Sócio')
  })

  it('colaborador não vê a ficha de cliente restrito', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({ name: 'Sigiloso', admin_only: true })
    const res = await asUser(emp).get(`/admin/clients/${criado.body.id}`)
    expect(res.status).toBe(404)
  })

  it('colaborador não pode criar cliente', async () => {
    const res = await asUser(emp).post('/admin/clients').send({ name: 'Novo' })
    expect(res.status).toBe(403)
  })
})
