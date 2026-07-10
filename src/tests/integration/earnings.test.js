import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makeRunningEntry } from '../helpers/factories.js'

const RATE = 137.5

// Conta de referência calculada por FORA do app (de propósito, pra não "errar
// igual"): minutos = round((fim-início)/60s), custo = round(min/60 × rate, 2).
const refMinutes = (startISO, endISO) =>
  Math.max(0, Math.round((new Date(endISO) - new Date(startISO)) / 60000))
const refCost = (minutes, rate) => Number(((minutes / 60) * rate).toFixed(2))
const cents = (v) => Math.round(Number(v) * 100)

describe('Ganhos do mês — fluxo principal de pagamento', () => {
  let admin, employee, project
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    employee = await makeUser({ role: 'employee', hourly_rate: RATE })
    project = await makeProject({ name: 'Projeto A' })
  })

  it('usuário apontou o mês inteiro: horas e R$ batem em /me/project-earnings e /me/stats', async () => {
    // Julho/2026, dias úteis, jornada 09:00–17:07 SP (-03:00). Os segundos de
    // saída variam pra forçar arredondamento no somatório do mês.
    const days = []
    for (let d = 1; d <= 31; d++) {
      const dow = new Date(Date.UTC(2026, 6, d)).getUTCDay()
      if (dow === 0 || dow === 6) continue
      const dd = String(d).padStart(2, '0')
      const endSec = d % 3 === 0 ? '29' : d % 3 === 1 ? '30' : '00'
      days.push({
        started_at: `2026-07-${dd}T09:00:00-03:00`,
        ended_at: `2026-07-${dd}T17:07:${endSec}-03:00`,
      })
    }

    let expMinutes = 0
    let expCost = 0
    for (const day of days) {
      const min = refMinutes(day.started_at, day.ended_at)
      expMinutes += min
      expCost += refCost(min, RATE)
      const res = await asUser(admin)
        .post('/admin/time-entries')
        .send({ user_id: employee.id, project_id: project.id, ...day })
      expect(res.status).toBe(201)
    }
    expCost = Number(expCost.toFixed(2))

    // 1) Ganhos por projeto, filtrando o mês
    const earn = await asUser(employee).get('/me/project-earnings?from=2026-07-01&to=2026-07-31')
    expect(earn.status).toBe(200)
    expect(earn.body).toHaveLength(1)
    const row = earn.body[0]
    expect(row.project_id).toBe(project.id)
    expect(row.entry_count).toBe(days.length)
    expect(row.total_minutes).toBe(expMinutes)
    expect(cents(row.total_cost)).toBe(cents(expCost))

    // 2) Sem filtro dá o mesmo (só existe julho)
    const earnAll = await asUser(employee).get('/me/project-earnings')
    expect(earnAll.body[0].total_minutes).toBe(expMinutes)
    expect(cents(earnAll.body[0].total_cost)).toBe(cents(expCost))

    // 3) Perspectiva mensal (stats) bate com o mesmo total
    const stats = await asUser(employee).get('/me/stats?month=2026-07')
    expect(stats.status).toBe(200)
    expect(stats.body.total_minutes).toBe(expMinutes)
    expect(cents(stats.body.total_cost)).toBe(cents(expCost))
    expect(stats.body.working_days).toBe(days.length)
    expect(stats.body.project_count).toBe(1)
  })

  it('só apontamentos concluídos entram no ganho (running é ignorado)', async () => {
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-10T09:00:00-03:00',
      ended_at: '2026-07-10T11:00:00-03:00', // 120 min
    })
    // Um apontamento em andamento não pode contar como ganho
    await makeRunningEntry({
      user_id: employee.id,
      project_id: project.id,
      started_at: new Date(),
    })

    const earn = await asUser(employee).get('/me/project-earnings')
    expect(earn.body).toHaveLength(1)
    expect(earn.body[0].total_minutes).toBe(120)
    expect(cents(earn.body[0].total_cost)).toBe(cents(refCost(120, RATE)))
  })

  it('filtro de data respeita o fuso America/Sao_Paulo nas bordas do mês', async () => {
    // 31/jul 23:30 SP → dentro de julho. 01/ago 00:10 SP → fora.
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-07-31T23:30:00-03:00',
      ended_at: '2026-07-31T23:50:00-03:00', // 20 min, ainda julho SP
    })
    await asUser(admin).post('/admin/time-entries').send({
      user_id: employee.id,
      project_id: project.id,
      started_at: '2026-08-01T00:10:00-03:00',
      ended_at: '2026-08-01T00:40:00-03:00', // agosto SP
    })

    const jul = await asUser(employee).get('/me/project-earnings?from=2026-07-01&to=2026-07-31')
    expect(jul.body).toHaveLength(1)
    expect(jul.body[0].total_minutes).toBe(20)
  })

  it('estagiário administrativo é bloqueado (salário fixo, sem ganho por hora)', async () => {
    const intern = await makeUser({ role: 'administrative_intern', hourly_rate: 0 })
    const res = await asUser(intern).get('/me/project-earnings')
    expect(res.status).toBe(403)
  })

  it('sem apontamentos → lista vazia', async () => {
    const res = await asUser(employee).get('/me/project-earnings')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
