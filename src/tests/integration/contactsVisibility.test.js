// Visibilidade de clientes/fornecedores: o colaborador VÊ os contatos comuns
// (admin_only = false) e NÃO vê os restritos; e só lê — criar/editar/excluir
// segue restrito a operações (admin + estagiário).
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'

describe('CRM — visibilidade e leitura-apenas para colaborador', () => {
  let emp, admin
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await query(`INSERT INTO clients (name, admin_only) VALUES ('Cliente Comum', false), ('Cliente Restrito', true)`)
    await query(`INSERT INTO suppliers (name, admin_only) VALUES ('Forn Comum', false), ('Forn Restrito', true)`)
  })

  it('employee VÊ clientes não-admin-only e NÃO vê os restritos', async () => {
    const res = await asUser(emp).get('/admin/clients')
    expect(res.status).toBe(200)
    const nomes = res.body.map((c) => c.name)
    expect(nomes).toContain('Cliente Comum')
    expect(nomes).not.toContain('Cliente Restrito')
  })

  it('admin vê todos os clientes, inclusive os restritos', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.status).toBe(200)
    const nomes = res.body.map((c) => c.name)
    expect(nomes).toContain('Cliente Comum')
    expect(nomes).toContain('Cliente Restrito')
  })

  it('employee VÊ fornecedores não-admin-only e NÃO vê os restritos', async () => {
    const res = await asUser(emp).get('/admin/suppliers')
    expect(res.status).toBe(200)
    const nomes = res.body.map((s) => s.name)
    expect(nomes).toContain('Forn Comum')
    expect(nomes).not.toContain('Forn Restrito')
  })

  it('admin vê todos os fornecedores, inclusive os restritos', async () => {
    const res = await asUser(admin).get('/admin/suppliers')
    expect(res.status).toBe(200)
    const nomes = res.body.map((s) => s.name)
    expect(nomes).toContain('Forn Comum')
    expect(nomes).toContain('Forn Restrito')
  })

  it('employee é só-leitura em clientes: criar/editar/excluir dá 403', async () => {
    const create = await asUser(emp).post('/admin/clients').send({ name: 'Novo' })
    expect(create.status).toBe(403)

    const { rows } = await query(`SELECT id FROM clients WHERE name = 'Cliente Comum'`)
    const put = await asUser(emp).put(`/admin/clients/${rows[0].id}`).send({ name: 'Editado' })
    expect(put.status).toBe(403)
    const del = await asUser(emp).delete(`/admin/clients/${rows[0].id}`)
    expect(del.status).toBe(403)
  })

  it('employee é só-leitura em fornecedores: criar/editar/excluir dá 403', async () => {
    const create = await asUser(emp).post('/admin/suppliers').send({ name: 'Novo' })
    expect(create.status).toBe(403)

    const { rows } = await query(`SELECT id FROM suppliers WHERE name = 'Forn Comum'`)
    const put = await asUser(emp).put(`/admin/suppliers/${rows[0].id}`).send({ name: 'Editado' })
    expect(put.status).toBe(403)
    const del = await asUser(emp).delete(`/admin/suppliers/${rows[0].id}`)
    expect(del.status).toBe(403)
  })
})

// Regressão: o gate admin_only vale para TODO caminho de leitura, não só para
// /admin/clients. GET /projects faz LEFT JOIN clients e devolvia phone/email/
// address do cliente restrito para qualquer autenticado — porta dos fundos do
// mesmo dado que a porta da frente esconde.
describe('CRM — cliente restrito não vaza contato pelo projeto', () => {
  let emp, admin, restrito, comum
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })

    const { rows: r } = await query(
      `INSERT INTO clients (name, email, phone, address, admin_only)
       VALUES ('Cliente Restrito', 'secreto@x.com', '11999999999', 'Rua Secreta, 1', true)
       RETURNING id`,
    )
    restrito = r[0]
    const { rows: c } = await query(
      `INSERT INTO clients (name, email, phone, address, admin_only)
       VALUES ('Cliente Comum', 'aberto@x.com', '11888888888', 'Rua Aberta, 2', false)
       RETURNING id`,
    )
    comum = c[0]

    await query(
      `INSERT INTO projects (name, client, client_id) VALUES ('Obra Restrita', 'Cliente Restrito', $1)`,
      [restrito.id],
    )
    await query(
      `INSERT INTO projects (name, client, client_id) VALUES ('Obra Comum', 'Cliente Comum', $1)`,
      [comum.id],
    )
  })

  it('employee não recebe contato de cliente restrito em GET /projects', async () => {
    const res = await asUser(emp).get('/projects')
    expect(res.status).toBe(200)

    const obra = res.body.find((p) => p.name === 'Obra Restrita')
    expect(obra).toBeTruthy()
    expect(obra.client_phone).toBeNull()
    expect(obra.client_email).toBeNull()
    expect(obra.client_address).toBeNull()
  })

  it('employee continua recebendo contato de cliente comum em GET /projects', async () => {
    const res = await asUser(emp).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra Comum')
    expect(obra.client_phone).toBe('11888888888')
    expect(obra.client_email).toBe('aberto@x.com')
    expect(obra.client_address).toBe('Rua Aberta, 2')
  })

  it('admin continua recebendo o contato do cliente restrito', async () => {
    const res = await asUser(admin).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra Restrita')
    expect(obra.client_phone).toBe('11999999999')
    expect(obra.client_email).toBe('secreto@x.com')
    expect(obra.client_address).toBe('Rua Secreta, 1')
  })
})
