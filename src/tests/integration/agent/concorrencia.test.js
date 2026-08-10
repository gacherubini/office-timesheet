import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

async function readSse(res) {
  return res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))
}

describe('throttle: um /agent/chat por usuário por vez', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => resetClient())

  it('2ª conversa simultânea do mesmo usuário recebe 429; libera o lock ao terminar', async () => {
    // Cliente que segura o 1º request em voo até liberarmos, sinalizando quando
    // já está dentro do stream (logo, já com o lock adquirido).
    let entrou, liberar
    const entrouP = new Promise((r) => { entrou = r })
    const bloqueio = new Promise((r) => { liberar = r })
    setClient({
      async stream(_p, onToken) {
        entrou()
        await bloqueio
        if (onToken) onToken('ok')
        return { message: { role: 'assistant', content: 'ok' }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
      },
    })

    // .then() força o supertest a DESPACHAR o request já (senão ele só dispara
    // quando a gente dá await, e o entrouP nunca resolveria).
    const p1 = asUser(emp).post('/agent/chat').send({ message: 'primeira' }).then((r) => r)
    await entrouP // garante o 1º em voo, segurando o lock

    const r2 = await asUser(emp).post('/agent/chat').send({ message: 'segunda' })
    expect(r2.status).toBe(429)
    expect(r2.body.error).toMatch(/conversa em andamento/i)

    liberar()
    const done1 = await readSse(await p1)
    expect(done1.some((e) => e.type === 'done')).toBe(true)

    // Com o lock liberado, uma nova conversa passa normalmente.
    setClient({
      async stream(_p, onToken) { if (onToken) onToken('oi'); return { message: { role: 'assistant', content: 'oi' }, usage: { prompt_tokens: 1, completion_tokens: 1 } } },
    })
    const r3 = await asUser(emp).post('/agent/chat').send({ message: 'terceira' })
    expect(r3.status).toBe(200)
    expect((await readSse(r3)).some((e) => e.type === 'done')).toBe(true)
  })
})
