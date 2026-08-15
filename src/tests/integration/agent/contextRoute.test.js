import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

describe('POST /agent/chat context', () => {
  let emp, acme
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    acme = await makeProject({ name: 'AcmeReal' })
  })
  afterEach(() => resetClient())

  it('injeta o nome do banco no system, ignora project_name do body', async () => {
    let system = ''
    setClient({
      async stream(params) {
        system = params.messages.find((m) => m.role === 'system')?.content || ''
        return { message: { role: 'assistant', content: 'ok' }, usage: {} }
      },
    })
    await asUser(emp).post('/agent/chat').send({
      message: 'como está isso?',
      context: { project_id: acme.id, project_name: 'EvilCorp' },
    })
    expect(system).toMatch(/AcmeReal/)
    expect(system).not.toMatch(/EvilCorp/)
  })

  it('id inexistente: chat segue sem o bloco', async () => {
    let system = ''
    setClient({
      async stream(params) {
        system = params.messages.find((m) => m.role === 'system')?.content || ''
        return { message: { role: 'assistant', content: 'ok' }, usage: {} }
      },
    })
    const res = await asUser(emp).post('/agent/chat').send({
      message: 'oi',
      context: { project_id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(res.status).toBe(200)
    expect(system).not.toMatch(/# Contexto da tela/)
  })
})
