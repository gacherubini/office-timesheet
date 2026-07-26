import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { testSink, clearTestSink } from '../../lib/logger.js'

// Pega a última linha que tem duracao_ms (a linha de request).
const lastRequestLog = () => [...testSink].reverse().find((l) => l.duracao_ms !== undefined)

describe('log de request', () => {
  let user

  beforeEach(async () => {
    await resetDb()
    user = await makeUser()
    clearTestSink()
  })

  it('request autenticado gera linha com todos os campos', async () => {
    await asUser(user).get('/me/stats')
    const log = lastRequestLog()

    expect(log).toBeDefined()
    expect(log.method).toBe('GET')
    expect(log.status).toBe(200)
    expect(typeof log.duracao_ms).toBe('number')
    expect(log.duracao_ms).toBeGreaterThanOrEqual(0)
    expect(log.user_id).toBe(user.id)
    expect(typeof log.req_id).toBe('string')
    expect(log.level).toBe(30) // info
  })

  it('route guarda o padrão da rota, não a URL concreta', async () => {
    await asUser(user).get(`/projects/999999/my-hours`)
    const log = lastRequestLog()

    expect(log.route).toContain(':id')
    expect(log.route).not.toContain('999999')
  })

  it('request sem token gera linha em nível warn e sem user_id', async () => {
    await request.get('/me/stats')
    const log = lastRequestLog()

    expect(log.status).toBe(401)
    expect(log.level).toBe(40) // warn
    expect(log.user_id).toBeUndefined()
  })

  it('/health não gera linha em nível info', async () => {
    await request.get('/health')
    const log = lastRequestLog()

    expect(log.level).toBe(20) // debug
  })

  it('nenhum log contém o token em texto puro', async () => {
    await asUser(user).get('/me/stats')
    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain('Bearer ')
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]+\./) // formato de JWT
  })

  it('a resposta traz o header x-request-id', async () => {
    const res = await asUser(user).get('/me/stats')
    expect(res.headers['x-request-id']).toBeTruthy()
  })
})
