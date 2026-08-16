import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser, request } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'
import { sessionCount } from '../../../lib/agent/session.js'
import { clearUserCache } from '../../../lib/userCache.js'

function fakeClientOnce(message, token) {
  let done = false
  return {
    async stream(_p, onToken) {
      if (!done && token) onToken(token)
      done = true
      return { message, usage: { prompt_tokens: 5, completion_tokens: 3 } }
    },
  }
}

function fakeComLeituraDepoisResposta() {
  let n = 0
  return {
    async stream() {
      n += 1
      if (n === 1) {
        return {
          message: {
            role: 'assistant',
            tool_calls: [{
              id: 'c1',
              type: 'function',
              function: { name: 'aniversariantes', arguments: '{}' },
            }],
          },
          usage: {},
        }
      }
      return { message: { role: 'assistant', content: 'hoje ninguém' }, usage: {} }
    },
  }
}

const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

async function chatOk(user, message = 'oi') {
  setClient(fakeClientOnce({ role: 'assistant', content: 'Olá!' }, 'Olá!'))
  const res = await asUser(user).post('/agent/chat').send({ message })
  expect(res.status).toBe(200)
  const eventos = readSse(res)
  const id = eventos.find((e) => e.type === 'session')?.conversation_id
  expect(id).toBeTruthy()
  return id
}

describe('GET/PATCH/DELETE /agent/conversations', () => {
  let emp
  const original = process.env.AGENT_ENABLED
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => {
    resetClient()
    if (original === undefined) delete process.env.AGENT_ENABLED
    else process.env.AGENT_ENABLED = original
  })

  it('401 sem JWT', async () => {
    expect((await request.get('/agent/conversations')).status).toBe(401)
    expect((await request.get('/agent/conversations/00000000-0000-4000-8000-000000000001')).status).toBe(401)
    expect((await request.patch('/agent/conversations/00000000-0000-4000-8000-000000000001').send({ title: 'x' })).status).toBe(401)
    expect((await request.delete('/agent/conversations/00000000-0000-4000-8000-000000000001')).status).toBe(401)
  })

  it('lista vazia', async () => {
    const res = await asUser(emp).get('/agent/conversations')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('chat bem-sucedido cria linha', async () => {
    const id = await chatOk(emp, 'quantas horas lancei?')
    const res = await asUser(emp).get('/agent/conversations')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({
      id,
      title: 'quantas horas lancei?',
    })
    expect(res.body.items[0].last_message_at).toBeTruthy()
    expect(res.body.items[0].created_at).toBeTruthy()
    expect(await sessionCount()).toBe(1)
  })

  it('chat abortado no primeiro turno NÃO cria linha', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    setClient({ async stream() { throw err } })
    const res = await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(200)
    const eventos = readSse(res)
    expect(eventos.some((e) => e.type === 'aborted')).toBe(true)
    expect(eventos.some((e) => e.type === 'error')).toBe(false)

    const list = await asUser(emp).get('/agent/conversations')
    expect(list.body.items).toEqual([])
    expect(await sessionCount()).toBe(0)
    const { rows } = await query('SELECT count(*)::int AS c FROM agent_messages')
    expect(rows[0].c).toBe(0)
  })

  it('GET devolve user+bot sem role:tool e sem bolha vazia de tool-call', async () => {
    setClient(fakeComLeituraDepoisResposta())
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'quem faz aniversário?' })
    const id = readSse(chat).find((e) => e.type === 'session').conversation_id

    const res = await asUser(emp).get(`/agent/conversations/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
    expect(res.body.role).toBe('employee')
    expect(res.body.title).toBe('quem faz aniversário?')
    expect(res.body.messages.map((m) => m.autor)).toEqual(['user', 'bot'])
    expect(res.body.messages[0]).toMatchObject({ autor: 'user', texto: 'quem faz aniversário?' })
    expect(res.body.messages[1]).toMatchObject({ autor: 'bot', texto: 'hoje ninguém' })
    expect(res.body.messages.every((m) => m.autor !== 'tool')).toBe(true)
    expect(res.body.messages.some((m) => m.autor === 'bot' && !m.texto && !m.proposta && !m.arquivos)).toBe(false)

    const { rows } = await query(
      `SELECT role FROM agent_messages WHERE conversation_id = $1 ORDER BY seq`,
      [id],
    )
    expect(rows.map((r) => r.role)).toContain('tool')
  })

  it('GET de outro user → 404', async () => {
    const id = await chatOk(emp)
    const outro = await makeUser({ role: 'employee' })
    const res = await asUser(outro).get(`/agent/conversations/${id}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  it('PATCH', async () => {
    const id = await chatOk(emp)
    const ok = await asUser(emp).patch(`/agent/conversations/${id}`).send({ title: '  Novo título  ' })
    expect(ok.status).toBe(200)
    expect(ok.body.title).toBe('Novo título')

    const vazio = await asUser(emp).patch(`/agent/conversations/${id}`).send({ title: '   ' })
    expect(vazio.status).toBe(400)

    const outro = await makeUser({ role: 'employee' })
    expect((await asUser(outro).patch(`/agent/conversations/${id}`).send({ title: 'hack' })).status).toBe(404)
  })

  it('DELETE some da lista e GET 404', async () => {
    const id = await chatOk(emp)
    const del = await asUser(emp).delete(`/agent/conversations/${id}`)
    expect(del.status).toBe(204)

    const list = await asUser(emp).get('/agent/conversations')
    expect(list.body.items).toEqual([])
    expect((await asUser(emp).get(`/agent/conversations/${id}`)).status).toBe(404)
    expect(await sessionCount()).toBe(0)

    const outro = await makeUser({ role: 'employee' })
    const id2 = await chatOk(emp, 'segunda')
    expect((await asUser(outro).delete(`/agent/conversations/${id2}`)).status).toBe(404)
    expect(await sessionCount()).toBe(1)
  })

  it('AGENT_ENABLED=false → GET/PATCH/lista 503, DELETE 204', async () => {
    const id = await chatOk(emp)
    process.env.AGENT_ENABLED = 'false'

    expect((await asUser(emp).get('/agent/conversations')).status).toBe(503)
    expect((await asUser(emp).get(`/agent/conversations/${id}`)).status).toBe(503)
    expect((await asUser(emp).patch(`/agent/conversations/${id}`).send({ title: 'x' })).status).toBe(503)

    const del = await asUser(emp).delete(`/agent/conversations/${id}`)
    expect(del.status).toBe(204)
    expect(await sessionCount()).toBe(0)
  })

  it('papel trocado → 404 / lista vazia daquela conversa', async () => {
    const id = await chatOk(emp)
    await query('UPDATE users SET role = $2 WHERE id = $1', [emp.id, 'admin'])
    clearUserCache()

    expect((await asUser(emp).get(`/agent/conversations/${id}`)).status).toBe(404)
    expect((await asUser(emp).patch(`/agent/conversations/${id}`).send({ title: 'x' })).status).toBe(404)

    const list = await asUser(emp).get('/agent/conversations')
    expect(list.status).toBe(200)
    expect(list.body.items).toEqual([])
    expect(await sessionCount()).toBe(1)
  })
})
