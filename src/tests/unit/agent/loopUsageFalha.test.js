import { describe, it, expect, beforeEach } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import { testSink, clearTestSink } from '../../../lib/logger.js'

const admin = { id: 1, role: 'admin' }
const findUsage = () => [...testSink].reverse().find((l) => l.evt === 'agent_usage')

// §18/§19.1: o evento de usage precisa sair mesmo quando a chamada ao modelo
// falha — senão o custo/tentativa some do log justamente quando algo deu errado.
describe('loop — usage observável em falha/timeout', () => {
  beforeEach(() => clearTestSink())

  it('cliente que rejeita: loga agent_usage com status error e propaga o erro', async () => {
    const client = { async stream() { throw new Error('provedor caiu') } }
    await expect(runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }], emit: () => {},
    })).rejects.toThrow(/provedor caiu/)

    const log = findUsage()
    expect(log).toBeDefined()
    expect(log.status).toBe('error')
    expect(log.erro).toMatch(/provedor caiu/)
  })

  it('timeout da chamada: agent_usage sai com status timeout', async () => {
    const client = { async stream() { throw new Error('timeout') } }
    await expect(runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }], emit: () => {},
    })).rejects.toThrow(/timeout/)

    const log = findUsage()
    expect(log.status).toBe('timeout')
  })

  it('caminho feliz: agent_usage sai com status ok', async () => {
    const client = { async stream() { return { message: { role: 'assistant', content: 'pronto' }, usage: { prompt_tokens: 3, completion_tokens: 2 } } } }
    const res = await runAgentTurn({
      client, profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }], emit: () => {},
    })
    expect(res.status).toBe('done')
    expect(findUsage().status).toBe('ok')
  })
})
