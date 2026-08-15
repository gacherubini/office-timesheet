import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

// Reproduz o bug de produção: a DeepSeek às vezes devolve um turno VAZIO (sem
// content e sem tool_calls) — ex.: corta no meio do raciocínio. O client monta
// { role:'assistant', content:null }. Se isso entrar no histórico e for reenviado
// no turno seguinte, a DeepSeek recusa a conversa inteira com
// 400 "content or tool_calls must be set". O fake captura o que é enviado.
function fakeVazioDepoisCaptura() {
  const capturas = []
  let turno = 0
  return {
    client: {
      async stream({ messages }) {
        capturas.push(messages)
        turno += 1
        if (turno === 1) return { message: { role: 'assistant', content: null }, usage: {} }
        return { message: { role: 'assistant', content: 'ok, agora respondi' }, usage: {} }
      },
    },
    capturas,
  }
}

describe('resposta vazia do modelo não envenena a conversa', () => {
  let emp
  beforeEach(async () => { await resetDb(); emp = await makeUser({ role: 'employee' }) })
  afterEach(() => resetClient())

  it('turno vazio não deixa assistant sem content/tool_calls no histórico do próximo turno', async () => {
    const { client, capturas } = fakeVazioDepoisCaptura()
    setClient(client)

    // Turno 1: o modelo responde vazio.
    const r1 = await asUser(emp).post('/agent/chat').send({ message: 'quanto cada projeto gastou?' })
    const eventos1 = readSse(r1)
    const convId = eventos1.find((e) => e.type === 'session')?.conversation_id
    expect(convId).toBeTruthy()
    // O usuário não pode ver bolha vazia: resposta final tem texto de fallback.
    const answer1 = eventos1.find((e) => e.type === 'answer')
    expect(answer1?.text?.trim()).toBeTruthy()

    // Turno 2: mesma conversa.
    await asUser(emp).post('/agent/chat').send({ message: 'travou?', conversation_id: convId })

    // O que foi enviado ao provedor no turno 2 NÃO pode conter um assistant sem
    // content e sem tool_calls — é exatamente o que a DeepSeek recusa com 400.
    const msgsTurno2 = capturas[capturas.length - 1]
    const malformada = msgsTurno2.find((m) => m.role === 'assistant' && !m.content && !(m.tool_calls?.length))
    expect(malformada).toBeUndefined()
  })
})
