import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser, request } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { remember } from '../../../lib/agent/downloads.js'

describe('GET /agent/downloads/:token', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee' })
  })

  it('401 sem JWT', async () => {
    const res = await request.get('/agent/downloads/qualquer')
    expect(res.status).toBe(401)
  })

  it('404 de outro usuário, mensagem genérica', async () => {
    const { token } = remember({
      profile: admin, buffer: Buffer.from('abc'), filename: 'r.csv', mime: 'text/csv',
    })
    const res = await asUser(emp).get(`/agent/downloads/${token}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/expirado ou indisponível/i)
  })

  it('200 do dono com attachment e o buffer', async () => {
    const { token } = remember({
      profile: admin, buffer: Buffer.from('abc'), filename: 'r.csv', mime: 'text/csv',
    })
    const res = await asUser(admin).get(`/agent/downloads/${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.headers['content-disposition']).toMatch(/r\.csv/)
    expect(res.text).toBe('abc')
  })
})
