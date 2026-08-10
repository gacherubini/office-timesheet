import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

// Cliente falso que CAPTURA as mensagens recebidas (pra checar que o texto do
// anexo entrou no turno do usuário) e responde texto fixo.
function capturingClient(resposta = 'ok') {
  const capturado = { messages: null }
  const client = {
    async stream({ messages }, onToken) {
      capturado.messages = messages
      onToken(resposta)
      return { message: { role: 'assistant', content: resposta }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
    },
  }
  return { client, capturado }
}

async function readSse(res) {
  return res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))
}

const ultimoUser = (messages) => [...messages].reverse().find((m) => m.role === 'user')

describe('POST /agent/chat com anexo', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => resetClient())

  it('injeta o texto do .txt anexado no turno do usuário', async () => {
    const { client, capturado } = capturingClient('li o documento')
    setClient(client)
    const res = await asUser(emp).post('/agent/chat')
      .field('message', 'do que fala esse arquivo?')
      .attach('file', Buffer.from('Projeto Cerúleo: escopo de branding.', 'utf8'), { filename: 'brief.txt', contentType: 'text/plain' })
    expect(res.status).toBe(200)
    const eventos = await readSse(res)
    expect(eventos.some((e) => e.type === 'answer')).toBe(true)
    const user = ultimoUser(capturado.messages)
    expect(user.content).toContain('Projeto Cerúleo')
    expect(user.content).toContain('do que fala esse arquivo?')
    expect(user.content).toContain('<<<ANEXO>>>')
  })

  it('permite anexar sem escrever pergunta', async () => {
    const { client, capturado } = capturingClient()
    setClient(client)
    const res = await asUser(emp).post('/agent/chat')
      .attach('file', Buffer.from('conteúdo do briefing', 'utf8'), { filename: 'b.txt', contentType: 'text/plain' })
    expect(res.status).toBe(200)
    expect(ultimoUser(capturado.messages).content).toContain('conteúdo do briefing')
  })

  it('formato não suportado → 400 com mensagem clara, sem abrir o stream', async () => {
    const { client } = capturingClient()
    setClient(client)
    const res = await asUser(emp).post('/agent/chat')
      .field('message', 'lê isso')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'foto.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/formato|suportado/i)
  })

  it('sem mensagem e sem arquivo → 400', async () => {
    const { client } = capturingClient()
    setClient(client)
    const res = await asUser(emp).post('/agent/chat').send({})
    expect(res.status).toBe(400)
  })

  it('follow-up reusa o texto do anexo já na sessão, sem reanexar', async () => {
    const c1 = capturingClient()
    setClient(c1.client)
    const r1 = await asUser(emp).post('/agent/chat')
      .field('message', 'resuma')
      .attach('file', Buffer.from('Marca Vega: tom sóbrio.', 'utf8'), { filename: 'brief.txt', contentType: 'text/plain' })
    const convId = (await readSse(r1)).find((e) => e.type === 'session').conversation_id

    const c2 = capturingClient()
    setClient(c2.client)
    await asUser(emp).post('/agent/chat').send({ message: 'e o tom?', conversation_id: convId })
    expect(JSON.stringify(c2.capturado.messages)).toContain('Marca Vega')
  })
})
