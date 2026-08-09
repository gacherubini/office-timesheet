// Teste de caracterização: descreve o que POST /me/vacation-requests JÁ FAZ,
// para a extração das regras para lib/vacationRequests.js ser provadamente
// sem mudança de comportamento. Escrito antes da extração e rodado depois.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'

function daquiA(dias) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

describe('POST /me/vacation-requests — regras de validação', () => {
  let emp, admin
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
  })

  it('cria como pending e conta os dias de forma inclusiva', async () => {
    const res = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(10), end_date: daquiA(14) })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(res.body.days_count).toBe(5)
  })

  it('auto-aprova quando quem pede é admin', async () => {
    const res = await asUser(admin).post('/me/vacation-requests')
      .send({ start_date: daquiA(10), end_date: daquiA(12) })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('approved')
  })

  it('recusa data inválida, início no passado e fim antes do início', async () => {
    const invalida = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: '10/01/2030', end_date: daquiA(12) })
    expect(invalida.status).toBe(400)
    expect(invalida.body.error).toMatch(/início inválida/i)

    const passado = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(-2), end_date: daquiA(12) })
    expect(passado.status).toBe(400)
    expect(passado.body.error).toMatch(/passado/i)

    const invertida = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(14), end_date: daquiA(10) })
    expect(invertida.status).toBe(400)
    expect(invertida.body.error).toMatch(/posterior/i)
  })

  it('recusa período sobreposto a pedido pendente ou aprovado', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'pending')`,
      [emp.id, daquiA(10), daquiA(14)],
    )
    const res = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(12), end_date: daquiA(16) })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/já existe/i)
  })
})
