// Teste de caracterização: descreve o que POST /me/vacation-requests JÁ FAZ,
// para a extração das regras para lib/vacationRequests.js ser provadamente
// sem mudança de comportamento. Escrito antes da extração e rodado depois.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'

// Âncora no fuso do estúdio (America/Sao_Paulo) — o backend valida "passado"
// com dateInSaoPaulo, não com UTC do host.
function daquiA(dias) {
  const hojeSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const [y, m, d] = hojeSp.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d + dias))
  const year = base.getUTCFullYear()
  const month = String(base.getUTCMonth() + 1).padStart(2, '0')
  const day = String(base.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

  it('aceita início em "hoje" no fuso America/Sao_Paulo', async () => {
    const res = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(0), end_date: daquiA(0) })
    expect(res.status).toBe(201)
    expect(res.body.start_date).toBe(daquiA(0))
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
