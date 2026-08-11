import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { _resetRateLimitBuckets } from '../../../lib/rateLimit.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

function fakeClient() {
  return {
    async stream() {
      return { message: { role: 'assistant', content: 'ok' }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
    },
  }
}

// O lock de concorrência barra o 2º chat SIMULTÂNEO; não barra o milésimo
// sequencial. Este é o freio por janela.
describe('rate limit do /agent/chat', () => {
  let a, b
  const original = process.env.AGENT_CHAT_RATE_MAX
  beforeEach(async () => {
    await resetDb()
    _resetRateLimitBuckets()
    process.env.AGENT_CHAT_RATE_MAX = '3'
    a = await makeUser({ role: 'employee' })
    b = await makeUser({ role: 'employee' })
    setClient(fakeClient())
  })
  afterEach(() => {
    resetClient()
    _resetRateLimitBuckets()
    if (original === undefined) delete process.env.AGENT_CHAT_RATE_MAX
    else process.env.AGENT_CHAT_RATE_MAX = original
  })

  it('passa até o teto e recusa a próxima com 429', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await asUser(a).post('/agent/chat').send({ message: `oi ${i}` })
      expect(ok.status).toBe(200)
    }
    const barrado = await asUser(a).post('/agent/chat').send({ message: 'mais uma' })
    expect(barrado.status).toBe(429)
    expect(barrado.headers['retry-after']).toBeDefined()
  })

  it('o teto é por usuário — o time todo sai pelo mesmo IP do escritório', async () => {
    for (let i = 0; i < 3; i++) await asUser(a).post('/agent/chat').send({ message: `oi ${i}` })
    const outro = await asUser(b).post('/agent/chat').send({ message: 'oi' })
    expect(outro.status).toBe(200)
  })
})
