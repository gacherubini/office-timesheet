import { describe, it, expect, beforeEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { resetDb, query } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'
import { signAccessToken } from '../../lib/jwt.js'

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

describe('Auth — reset invalida sessões e SSE checa usuário', () => {
  let employee
  beforeEach(async () => {
    await resetDb()
    employee = await makeUser({ role: 'employee', password: 'senha-velha' })
  })

  it('reset de senha invalida JWT emitido antes', async () => {
    const oldToken = signAccessToken(employee)

    // simula forgot+reset: grava token e reseta senha
    const raw = randomBytes(32).toString('hex')
    await query(
      `UPDATE users
          SET password_reset_token = $1,
              password_reset_expires_at = now() + interval '1 hour'
        WHERE id = $2`,
      [sha256Hex(raw), employee.id],
    )

    const reset = await request.post('/auth/reset-password').send({
      token: raw,
      newPassword: 'senha-nova-123',
    })
    expect(reset.status).toBe(200)

    // token antigo → 401
    const withOld = await request
      .get('/me/active-timer')
      .set('Authorization', `Bearer ${oldToken}`)
    expect(withOld.status).toBe(401)

    // login com senha nova funciona
    const login = await request.post('/auth/login').send({
      email: employee.email,
      password: 'senha-nova-123',
    })
    expect(login.status).toBe(200)
    expect(login.body.access_token).toBeTruthy()
  })

  it('SSE recusa usuário inativo', async () => {
    const token = signAccessToken(employee)
    await query(`UPDATE users SET is_active = false WHERE id = $1`, [employee.id])

    const res = await request
      .get(`/notifications/stream?token=${encodeURIComponent(token)}`)
      .buffer(true)
      .parse((res, cb) => {
        // não fica no stream: espera status e fecha
        res.on('data', () => {})
        res.on('end', () => cb(null, res.text || ''))
      })

    expect(res.status).toBe(403)
  })

  it('admin não se auto-desativa nem troca o próprio papel', async () => {
    const admin = await makeAdmin()
    const off = await asUser(admin).put(`/admin/users/${admin.id}`).send({ is_active: false })
    expect(off.status).toBe(400)

    const role = await asUser(admin).put(`/admin/users/${admin.id}`).send({ role: 'employee' })
    expect(role.status).toBe(400)
  })

  it('employee não lista/edita clientes (canManageClients = operações)', async () => {
    const list = await asUser(employee).get('/admin/clients')
    expect(list.status).toBe(403)
  })
})
