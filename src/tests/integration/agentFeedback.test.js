import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { asUser } from '../helpers/api.js'
import { resetDb, query } from '../helpers/db.js'
import { makeUser } from '../helpers/factories.js'
import { insertTurn } from '../../lib/agent/conversationsRepo.js'

async function respostaDoBot(profile, texto = 'R$ 42.310.') {
  const conversationId = randomUUID()
  const ids = await insertTurn(conversationId, profile, [
    { role: 'user', content: 'quanto custou?', tool_calls: null, tool_call_id: null, ui: { texto_visivel: 'quanto custou?' } },
    { role: 'assistant', content: texto, tool_calls: null, tool_call_id: null, ui: null },
  ])
  return ids.find((r) => r.role === 'assistant').id
}

describe('POST /agent/feedback', () => {
  let dono
  beforeEach(async () => {
    await resetDb()
    dono = await makeUser({ role: 'admin' })
  })

  it('dono avalia a própria resposta', async () => {
    const messageId = await respostaDoBot(dono)
    const res = await asUser(dono).post('/agent/feedback').send({ message_id: messageId, rating: 'up' })
    expect(res.status).toBe(204)
    const { rows } = await query('SELECT rating FROM agent_feedback')
    expect(rows[0].rating).toBe('up')
  })

  it('negativo com motivo da lista', async () => {
    const messageId = await respostaDoBot(dono)
    const res = await asUser(dono)
      .post('/agent/feedback').send({ message_id: messageId, rating: 'down', motivo: 'incorreto' })
    expect(res.status).toBe(204)
  })

  it('motivo fora da lista vira 400, não 500', async () => {
    const messageId = await respostaDoBot(dono)
    const res = await asUser(dono)
      .post('/agent/feedback').send({ message_id: messageId, rating: 'down', motivo: 'inventado' })
    expect(res.status).toBe(400)
  })

  it('rating inválido vira 400', async () => {
    const messageId = await respostaDoBot(dono)
    const res = await asUser(dono).post('/agent/feedback').send({ message_id: messageId, rating: 'talvez' })
    expect(res.status).toBe(400)
  })

  // A trava que importa: sem ela, qualquer uuid de mensagem vira alvo.
  it('não dá para avaliar a conversa de outra pessoa', async () => {
    const outro = await makeUser({ role: 'admin', email: 'outro@x.com' })
    const messageId = await respostaDoBot(dono)
    const res = await asUser(outro).post('/agent/feedback').send({ message_id: messageId, rating: 'down', motivo: 'tom' })
    expect(res.status).toBe(404)
    const { rows } = await query('SELECT * FROM agent_feedback')
    expect(rows).toHaveLength(0)
  })

  it('mensagem inexistente vira 404', async () => {
    const res = await asUser(dono).post('/agent/feedback').send({ message_id: randomUUID(), rating: 'up' })
    expect(res.status).toBe(404)
  })

  it('id que não é uuid vira 400, não estoura no banco', async () => {
    const res = await asUser(dono).post('/agent/feedback').send({ message_id: 'nao-sou-uuid', rating: 'up' })
    expect(res.status).toBe(400)
  })

  it('sem token, 401', async () => {
    const messageId = await respostaDoBot(dono)
    const { request } = await import('../helpers/api.js')
    const res = await request.post('/agent/feedback').send({ message_id: messageId, rating: 'up' })
    expect(res.status).toBe(401)
  })
})

describe('GET /admin/agent/feedback', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
  })

  it('devolve resumo e fila de negativos', async () => {
    const m1 = await respostaDoBot(admin, 'boa')
    const m2 = await respostaDoBot(admin, 'ruim')
    await asUser(admin).post('/agent/feedback').send({ message_id: m1, rating: 'up' })
    await asUser(admin).post('/agent/feedback').send({ message_id: m2, rating: 'down', motivo: 'incorreto' })

    const res = await asUser(admin).get('/admin/agent/feedback')
    expect(res.status).toBe(200)
    expect(res.body.resumo).toMatchObject({ up: 1, down: 1 })
    expect(res.body.resumo.motivos).toEqual([{ motivo: 'incorreto', total: 1 }])
    expect(res.body.negativos[0]).toMatchObject({ motivo: 'incorreto', resposta: 'ruim' })
  })

  it('quem não é admin não vê', async () => {
    const zé = await makeUser({ role: 'employee', email: 'ze@x.com' })
    const res = await asUser(zé).get('/admin/agent/feedback')
    expect(res.status).toBe(403)
  })
})
