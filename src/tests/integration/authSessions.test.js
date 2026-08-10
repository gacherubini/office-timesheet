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

  it('self-lock resiste a id em outro case e a is_active falsy (0)', async () => {
    const admin = await makeAdmin()

    // mesmo id em caixa-alta: o uuid casa no Postgres, o guard tem que casar também
    const upper = await asUser(admin)
      .put(`/admin/users/${admin.id.toUpperCase()}`)
      .send({ is_active: false })
    expect(upper.status).toBe(400)

    // is_active falsy não-boolean (0) não pode driblar o self-lock
    const zero = await asUser(admin).put(`/admin/users/${admin.id}`).send({ is_active: 0 })
    expect(zero.status).toBe(400)

    // sanidade: continua ativo após as duas tentativas
    const { rows } = await query('SELECT is_active FROM users WHERE id = $1', [admin.id])
    expect(rows[0].is_active).toBe(true)
  })

  it('SSE encerra o stream quando o usuário é desativado no meio', async () => {
    const prev = process.env.SSE_HEARTBEAT_MS
    process.env.SSE_HEARTBEAT_MS = '30' // heartbeat rápido só pra este teste
    try {
      const token = signAccessToken(employee)
      // o .then(...) dispara o request no superagent AGORA (senão ele só
      // enviaria no await, depois da desativação, e o connect já viria 403).
      const streamDone = request
        .get(`/notifications/stream?token=${encodeURIComponent(token)}`)
        .buffer(true)
        .parse((res, cb) => {
          res.on('data', () => {})
          res.on('end', () => cb(null, res.text || ''))
        })
        .then((res) => res)

      // conecta com o usuário ATIVO (headers 200 + heartbeat rodando), então
      // desativa no meio do stream
      await new Promise((r) => setTimeout(r, 90))
      await query('UPDATE users SET is_active = false WHERE id = $1', [employee.id])

      // se o heartbeat não revalidasse, o stream ficaria aberto e isto daria timeout
      const res = await streamDone
      expect(res.status).toBe(200)
    } finally {
      if (prev === undefined) delete process.env.SSE_HEARTBEAT_MS
      else process.env.SSE_HEARTBEAT_MS = prev
    }
  })

  it('employee LISTA clientes (leitura), mas NÃO gere (canManage = operações)', async () => {
    // Ler a lista é liberado (o filtro admin_only esconde os restritos); só a
    // gestão (criar/editar/excluir) segue restrita a admin + estagiário.
    const list = await asUser(employee).get('/admin/clients')
    expect(list.status).toBe(200)
    const create = await asUser(employee).post('/admin/clients').send({ name: 'Novo' })
    expect(create.status).toBe(403)
  })
})
