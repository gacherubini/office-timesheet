import { describe, it, expect, beforeEach } from 'vitest'
import { auditAgentAction, logUsage } from '../../../lib/agent/audit.js'
import { testSink, clearTestSink } from '../../../lib/logger.js'

const find = (evt) => [...testSink].reverse().find((l) => l.evt === evt)

describe('audit', () => {
  beforeEach(() => clearTestSink())

  it('auditAgentAction registra quem, o quê e o antes/depois', () => {
    auditAgentAction({
      profile: { id: 7, role: 'employee' },
      tool: 'encerrar_apontamento',
      params: { entry_id: 42 },
      before: { status: 'running' },
      after: { status: 'completed' },
    })
    const log = find('agent_action')
    expect(log).toBeDefined()
    expect(log.user_id).toBe(7)
    expect(log.tool).toBe('encerrar_apontamento')
    expect(log.before.status).toBe('running')
    expect(log.after.status).toBe('completed')
  })

  it('logUsage calcula custo a partir dos preços de env', () => {
    process.env.AGENT_PRICE_IN = '0.435'   // USD / 1M tokens
    process.env.AGENT_PRICE_OUT = '0.87'
    process.env.AGENT_PRICE_CACHED = '0.0087'
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const log = find('agent_usage')
    expect(log.tokens_in).toBe(1_000_000)
    expect(log.custo).toBeCloseTo(0.435, 5)
  })
})
