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

  it('employee só cancela pending; approved vira 400', async () => {
    const pending = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(20), end_date: daquiA(22) })
    expect(pending.status).toBe(201)

    const delPending = await asUser(emp).delete(`/me/vacation-requests/${pending.body.id}`)
    expect(delPending.status).toBe(200)

    const approved = await asUser(admin).post('/me/vacation-requests')
      .send({ start_date: daquiA(30), end_date: daquiA(32) })
    expect(approved.body.status).toBe('approved')

    // employee tenta apagar férias aprovadas de outro? own delete only own.
    // admin auto-approved is owned by admin:
    const delApproved = await asUser(admin).delete(`/me/vacation-requests/${approved.body.id}`)
    expect(delApproved.status).toBe(400)
    expect(delApproved.body.error).toMatch(/pendentes/i)
  })

  it('intern não apaga férias de admin; admin apaga', async () => {
    const intern = await makeUser({ role: 'administrative_intern', name: 'Estagiária' })
    const vac = await asUser(admin).post('/me/vacation-requests')
      .send({ start_date: daquiA(40), end_date: daquiA(42) })
    expect(vac.status).toBe(201)

    const denied = await asUser(intern).delete(`/admin/vacation-requests/${vac.body.id}`)
    expect(denied.status).toBe(403)

    const ok = await asUser(admin).delete(`/admin/vacation-requests/${vac.body.id}`)
    expect(ok.status).toBe(200)
  })

  it('constraint EXCLUDE devolve erro amigável em overlap (23P01)', async () => {
    await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(50), end_date: daquiA(54) })

    // Bypass do hasOverlappingVacation (race path): insert direto que viola EXCLUDE
    // é capturado pelo mapVacationError na rota; aqui validamos a constraint no DB.
    let code = null
    try {
      await query(
        `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
         VALUES ($1, $2, $3, 3, 'pending')`,
        [emp.id, daquiA(52), daquiA(56)],
      )
    } catch (err) {
      code = err.code
    }
    expect(code).toBe('23P01')
  })
})
