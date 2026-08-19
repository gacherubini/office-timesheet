import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('044 — admissão e desligamento do colaborador', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('as colunas existem e começam nulas', async () => {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name) VALUES ('a@b.c','x','Ana')
       RETURNING admission_date, termination_date`)
    expect(rows[0].admission_date).toBeNull()
    expect(rows[0].termination_date).toBeNull()
  })

  it('a criação de usuário aceita a data de admissão', async () => {
    const res = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, admission_date: '2024-03-01',
    })
    expect(res.status).toBe(201)
    const { rows } = await query(`SELECT admission_date FROM users WHERE email = 'ana@x.com'`)
    expect(String(rows[0].admission_date).slice(0, 10)).toBe('2024-03-01')
  })

  it('a edição grava admissão e desligamento', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123', role: 'employee', hourly_rate: 100,
    })
    await asUser(admin).put(`/admin/users/${criado.body.user.id}`).send({
      admission_date: '2024-03-01', termination_date: '2026-08-01',
    })
    const { rows } = await query(`SELECT admission_date, termination_date FROM users WHERE id = $1`, [criado.body.user.id])
    expect(String(rows[0].admission_date).slice(0, 10)).toBe('2024-03-01')
    expect(String(rows[0].termination_date).slice(0, 10)).toBe('2026-08-01')
  })

  it('mandar string vazia limpa a data em vez de gravar lixo', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123', role: 'employee',
      hourly_rate: 100, admission_date: '2024-03-01',
    })
    await asUser(admin).put(`/admin/users/${criado.body.user.id}`).send({ admission_date: '' })
    const { rows } = await query(`SELECT admission_date FROM users WHERE id = $1`, [criado.body.user.id])
    expect(rows[0].admission_date).toBeNull()
  })
})
