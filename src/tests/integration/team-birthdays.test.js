import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { dateInSaoPaulo } from '../../lib/dates.js'

// "Hoje" no fuso do estúdio: os fixtures são construídos em cima dele para o
// teste não depender do dia em que roda.
const HOJE = dateInSaoPaulo()
const [ANO, MM, DD] = HOJE.split('-')
const NASC_HOJE = `1990-${MM}-${DD}`
// Um dia garantidamente diferente de hoje (troca o mês, e o dia 15 existe sempre).
const OUTRO_MES = MM === '06' ? '07' : '06'
const NASC_OUTRO_MES = `1988-${OUTRO_MES}-15`

describe('/me/team-birthdays — aniversariantes do time', () => {
  let employee
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', name: 'Quem Pergunta', birth_date: '1995-01-02' })
  })

  it('colaborador vê os aniversariantes de hoje (dado aberto a todos os papéis)', async () => {
    await makeUser({ name: 'Faz Hoje', birth_date: NASC_HOJE })
    await makeUser({ name: 'Faz Outro Dia', birth_date: NASC_OUTRO_MES })

    const res = await asUser(employee).get('/me/team-birthdays')
    expect(res.status).toBe(200)
    const nomes = res.body.aniversariantes.map((a) => a.nome)
    expect(nomes).toContain('Faz Hoje')
    expect(nomes).not.toContain('Faz Outro Dia')
  })

  it('nunca expõe o ano/idade — só nome, dia, mês e cargo', async () => {
    await makeUser({ name: 'Faz Hoje', birth_date: NASC_HOJE })
    const res = await asUser(employee).get('/me/team-birthdays')
    const alvo = res.body.aniversariantes.find((a) => a.nome === 'Faz Hoje')
    expect(alvo).toBeDefined()
    expect(Object.keys(alvo).sort()).toEqual(['cargo', 'dia', 'mes', 'nome'])
    expect(JSON.stringify(res.body)).not.toContain(NASC_HOJE.slice(0, 4)) // o ano não vaza
  })

  it('com ?month= retorna o mês inteiro, ignorando o dia de hoje', async () => {
    await makeUser({ name: 'Aniversário no Mês', birth_date: NASC_OUTRO_MES })
    const res = await asUser(employee).get(`/me/team-birthdays?month=${ANO}-${OUTRO_MES}`)
    expect(res.status).toBe(200)
    expect(res.body.aniversariantes.map((a) => a.nome)).toContain('Aniversário no Mês')
  })

  it('exclui usuário inativo mesmo fazendo aniversário hoje', async () => {
    await makeUser({ name: 'Inativo Hoje', birth_date: NASC_HOJE, is_active: false })
    const res = await asUser(employee).get('/me/team-birthdays')
    expect(res.body.aniversariantes.map((a) => a.nome)).not.toContain('Inativo Hoje')
  })

  it('month malformado → 400', async () => {
    const res = await asUser(employee).get('/me/team-birthdays?month=2026-8')
    expect(res.status).toBe(400)
  })

  it('exige autenticação', async () => {
    const res = await request.get('/me/team-birthdays')
    expect(res.status).toBe(401)
  })
})

// Guarda de PF: se um dia clientes entrarem no card, pessoa jurídica não pode
// "fazer aniversário". A data de fundação de uma construtora não é aniversário
// de ninguém. Ver a decisão de 18/08/2026 no spec do bloco B, §7.
describe('aniversariantes ignoram pessoa jurídica', () => {
  beforeEach(async () => { await resetDb() })

  it('a lista continua vindo só de users', async () => {
    const u = await makeUser({ role: 'employee', name: 'Ana', birth_date: '1990-08-18' })
    await query(
      `INSERT INTO clients (name, person_type, razao_social, birth_date)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '1990-08-18')`)
    const res = await asUser(u).get('/birthdays')
    expect(res.status).toBe(200)
    expect(res.body.map((p) => p.name)).toContain('Ana')
    expect(res.body.map((p) => p.name)).not.toContain('Construtora X')
  })

  it('o endpoint da equipe também não traz PJ', async () => {
    const u = await makeUser({ role: 'employee', name: 'Ana', birth_date: '1990-08-18' })
    await query(
      `INSERT INTO clients (name, person_type, razao_social, birth_date)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '1990-08-18')`)
    const res = await asUser(u).get('/me/team-birthdays')
    expect(res.body.aniversariantes.map((p) => p.name)).not.toContain('Construtora X')
  })
})
