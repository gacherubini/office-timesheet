import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

describe('uso do agente é persistido em agent_usage', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    setClient({
      async stream() {
        return { message: { role: 'assistant', content: 'oi' }, usage: { prompt_tokens: 100, completion_tokens: 20 } }
      },
    })
  })
  afterEach(() => resetClient())

  it('uma conversa grava uma linha de uso com os tokens', async () => {
    await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    const { rows } = await query('SELECT * FROM agent_usage WHERE user_id = $1', [emp.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].tokens_in).toBe(100)
    expect(rows[0].tokens_out).toBe(20)
    expect(rows[0].status).toBe('ok')
  })
})
