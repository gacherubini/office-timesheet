import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeApprovedVacation } from '../helpers/factories.js'

// Colunas `date` do Postgres devem sair da API como string pura "YYYY-MM-DD"
// (db.js registra o parser do OID 1082). Se um dia virarem objeto Date, o JSON
// vira "...T00:00:00.000Z" e toda tela que formata data anda um dia pra trás —
// foi assim que um bônus de 17/08 apareceu como 16/08 no relatório.
const PURA = /^\d{4}-\d{2}-\d{2}$/

describe('datas puras na API', () => {
  let admin, employee
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: 100, birth_date: '1994-08-17' })
  })

  it('bônus volta exatamente no dia em que foi gravado', async () => {
    const criado = await asUser(admin).post('/admin/bonuses').send({
      user_id: employee.id,
      title: 'Bônus',
      amount: 300,
      bonus_date: '2026-08-17',
    })
    expect(criado.status).toBe(201)
    expect(criado.body.bonus_date).toBe('2026-08-17')

    const lista = await asUser(admin).get('/admin/bonuses')
    expect(lista.status).toBe(200)
    expect(lista.body[0].bonus_date).toBe('2026-08-17')
    expect(lista.body[0].bonus_date).toMatch(PURA)

    const meus = await asUser(employee).get('/me/bonuses')
    expect(meus.body[0].bonus_date).toBe('2026-08-17')
  })

  it('relatório financeiro mantém bônus e despesa no dia certo', async () => {
    await asUser(admin).post('/admin/bonuses').send({
      user_id: employee.id, title: 'Bônus', amount: 300, bonus_date: '2026-08-17',
    })
    const despesa = await asUser(employee).post('/me/expense-requests').send({
      title: 'Táxi', amount: 50, expense_date: '2026-08-01',
    })
    expect(despesa.status).toBe(201)
    expect(despesa.body.expense_date).toBe('2026-08-01')

    const rel = await asUser(admin).get('/admin/reports/financial?start_date=2026-08-01&end_date=2026-08-31')
    expect(rel.status).toBe(200)
    expect(rel.body.bonuses[0].bonus_date).toBe('2026-08-17')
    expect(rel.body.expenses[0].expense_date).toBe('2026-08-01')
  })

  it('férias e nascimento também saem como data pura', async () => {
    await makeApprovedVacation({
      user_id: employee.id, start_date: '2026-08-17', end_date: '2026-08-21', days_count: 5,
    })

    const ferias = await asUser(admin).get('/admin/vacation-requests?status=all')
    expect(ferias.status).toBe(200)
    expect(ferias.body[0].start_date).toBe('2026-08-17')
    expect(ferias.body[0].end_date).toBe('2026-08-21')

    const pessoas = await asUser(admin).get('/admin/users')
    expect(pessoas.status).toBe(200)
    const alvo = pessoas.body.find((u) => u.id === employee.id)
    expect(alvo.birth_date).toBe('1994-08-17')
  })
})
