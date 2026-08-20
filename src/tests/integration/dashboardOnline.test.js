// "Online" tem duas fontes: sinal recente (request/heartbeat) e cronômetro
// rodando. A segunda existe porque quem está com o timer aberto está
// trabalhando, mesmo que a aba não mande request nenhuma.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makeRunningEntry, makeOpenTaskTimer } from '../helpers/factories.js'
import { limparOnline } from '../../lib/onlineUsers.js'

const PERIODO = '?start_date=2026-08-01&end_date=2026-08-31'

describe('GET /dashboard — usuários online', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('conta quem deu heartbeat', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    await asUser(emp).post('/me/heartbeat')

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.status).toBe(200)
    // O próprio admin conta: a request dele passou pelo requireAuth.
    expect(res.body.kpis.online_users).toBe(2)
  })

  it('não conta quem não deu sinal nenhum', async () => {
    await makeUser({ role: 'employee', name: 'Fantasma' })

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1) // só o admin da request
  })

  it('conta quem tem cronômetro rodando mesmo sem request recente', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })
    // Zera a presença: a Ana não fez request nenhuma, só tem o timer aberto.
    limparOnline()

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2) // Ana pelo timer + admin pela request
  })

  it('não conta duas vezes quem tem timer E sinal recente', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })
    await asUser(emp).post('/me/heartbeat')

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2)
  })

  it('usuário desativado não conta como online', async () => {
    const inativo = await makeUser({ role: 'employee', name: 'Desligado', is_active: false })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: inativo.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1)
  })

  // O item 8 do PDF pôs "Contar horas" em todo card do quadro. Esse timer mora
  // em task_time_logs, não em time_entries — quem contava só o ponto deixava
  // de fora justamente quem está apontando hora numa tarefa.
  it('conta quem está com o cronômetro de TAREFA rodando', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    await makeOpenTaskTimer({ user_id: emp.id })
    limparOnline() // Ana não fez request nenhuma, só tem o timer de tarefa

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2) // Ana pelo timer + admin pela request
  })

  // Cronômetro esquecido não é presença: sem o corte, quem fechou o notebook
  // na sexta sem parar o timer apareceria online na segunda, e o número
  // pararia de responder a quem entra e sai.
  it('não conta cronômetro de tarefa aberto há mais de 12h', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Esquecida' })
    await makeOpenTaskTimer({
      user_id: emp.id,
      started_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
    })
    limparOnline()

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1) // só o admin da request
  })

  it('não conta ponto aberto há mais de 12h', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Esquecido' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
    })
    limparOnline()

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1)
  })

  it('não conta duas vezes quem tem os dois cronômetros abertos', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })
    await makeOpenTaskTimer({ user_id: emp.id })
    limparOnline()

    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2) // Ana uma vez só + admin
  })

  it('active_users e total_users continuam no payload', async () => {
    const res = await asUser(admin).get(`/admin/dashboard${PERIODO}`)
    expect(res.body.kpis.active_users).toBeTypeOf('number')
    expect(res.body.kpis.total_users).toBeTypeOf('number')
  })
})
