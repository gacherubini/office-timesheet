import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporPedirFerias.js'

// Datas sempre no futuro: a rota espelhada recusa férias que começam no passado.
function daquiA(dias) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

describe('tool propor_pedir_ferias', () => {
  let emp, admin, inicio, fim
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    inicio = daquiA(10)
    fim = daquiA(14)
  })

  it('propose descreve o pedido e conta os dias, sem gravar nada', async () => {
    const p = await tool.propose(emp, { inicio, fim, motivo: 'descanso' })
    expect(p.kind).toBe('pedir_ferias')
    expect(p.payload.start_date).toBe(inicio)
    expect(p.payload.days_count).toBe(5) // inclusivo nas duas pontas
    expect(p.descricao).toMatch(/5 dias/)
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM vacation_requests WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose recusa data no passado com a mesma mensagem da rota', async () => {
    await expect(tool.propose(emp, { inicio: daquiA(-3), fim })).rejects.toThrow(/passado/i)
  })

  it('propose recusa fim antes do início', async () => {
    await expect(tool.propose(emp, { inicio: fim, fim: inicio })).rejects.toThrow(/posterior/i)
  })

  it('propose recusa período que se sobrepõe a pedido existente', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'pending')`,
      [emp.id, inicio, fim],
    )
    await expect(tool.propose(emp, { inicio, fim })).rejects.toThrow(/sobrep|já existe/i)
  })

  it('execute grava como pending para o colaborador', async () => {
    const { after } = await tool.execute(emp, { start_date: inicio, end_date: fim, days_count: 5, reason: null })
    expect(after.status).toBe('pending')
    expect(after.user_id).toBe(emp.id)
  })

  it('execute auto-aprova para o admin, igual à rota espelhada', async () => {
    const { after } = await tool.execute(admin, { start_date: inicio, end_date: fim, days_count: 5, reason: null })
    expect(after.status).toBe('approved')
  })

  it('execute revalida: sobreposição criada entre propor e aprovar → recusa', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'approved')`,
      [emp.id, inicio, fim],
    )
    await expect(
      tool.execute(emp, { start_date: inicio, end_date: fim, days_count: 5, reason: null }),
    ).rejects.toThrow(/sobrep|já existe/i)
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM vacation_requests WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(1) // só o que já existia
  })
})
