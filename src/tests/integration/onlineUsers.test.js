// O sinal de presença sai do requireAuth, não de cada rota — então qualquer
// request autenticada marca, e o heartbeat existe só para a aba parada não
// sumir do indicador.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { usuariosOnline } from '../../lib/onlineUsers.js'

describe('presença — heartbeat e carimbo do requireAuth', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
  })

  it('POST /me/heartbeat responde 204 sem corpo', async () => {
    const res = await asUser(emp).post('/me/heartbeat')
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
  })

  it('o heartbeat deixa o usuário online', async () => {
    expect(usuariosOnline().has(emp.id)).toBe(false)
    await asUser(emp).post('/me/heartbeat')
    expect(usuariosOnline().has(emp.id)).toBe(true)
  })

  it('qualquer request autenticada também marca presença', async () => {
    expect(usuariosOnline().has(emp.id)).toBe(false)
    await asUser(emp).get('/me')
    expect(usuariosOnline().has(emp.id)).toBe(true)
  })

  it('request sem token não marca ninguém', async () => {
    await request.post('/me/heartbeat')
    expect(usuariosOnline().size).toBe(0)
  })

  // Quem levou 403 não está usando o sistema — está sendo barrado por ele.
  it('usuário inativo (403) não é marcado como online', async () => {
    const inativo = await makeUser({ role: 'employee', name: 'Bloqueado', is_active: false })
    const res = await asUser(inativo).get('/me')
    expect(res.status).toBe(403)
    expect(usuariosOnline().has(inativo.id)).toBe(false)
  })
})
