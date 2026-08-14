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
    const antes = { ...process.env }
    process.env.AGENT_PRICE_IN = '0.14'    // DeepSeek V4 Flash, USD / 1M tokens
    process.env.AGENT_PRICE_OUT = '0.28'
    process.env.AGENT_PRICE_CACHED = '0.14'
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const log = find('agent_usage')
    expect(log.tokens_in).toBe(1_000_000)
    expect(log.custo).toBeCloseTo(0.14, 5)
    process.env = antes
  })

  it('custo é null quando os preços não estão configurados (zero mentiria)', () => {
    delete process.env.AGENT_PRICE_IN
    delete process.env.AGENT_PRICE_OUT
    delete process.env.AGENT_PRICE_CACHED
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 500_000 })
    const log = find('agent_usage')
    expect(log.tokens_in).toBe(1_000_000)
    expect(log.custo).toBeNull()
  })

  it('preço parcial já basta para calcular (o que falta conta como zero)', () => {
    delete process.env.AGENT_PRICE_OUT
    delete process.env.AGENT_PRICE_CACHED
    process.env.AGENT_PRICE_IN = '0.14'
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 1_000_000 })
    const log = find('agent_usage')
    expect(log.custo).toBeCloseTo(0.14, 5)
  })
})

import { custoDeUso, precosConfigurados } from '../../../lib/agent/audit.js'

describe('custoDeUso / precosConfigurados', () => {
  it('sem preços, custo é null e precosConfigurados é false', () => {
    const antes = { ...process.env }
    delete process.env.AGENT_PRICE_IN; delete process.env.AGENT_PRICE_OUT; delete process.env.AGENT_PRICE_CACHED
    expect(precosConfigurados()).toBe(false)
    expect(custoDeUso({ tokensIn: 1_000_000, tokensOut: 1_000_000, cached: 0 })).toBeNull()
    process.env = antes
  })
  it('com preço, calcula em USD (cacheado a preço de cache)', () => {
    const antes = { ...process.env }
    process.env.AGENT_PRICE_IN = '0.14'; process.env.AGENT_PRICE_OUT = '0.28'; process.env.AGENT_PRICE_CACHED = '0.014'
    expect(precosConfigurados()).toBe(true)
    // 500k não-cacheado * 0.14 + 500k cacheado * 0.014 + 0 saída = 0.07 + 0.007
    expect(custoDeUso({ tokensIn: 1_000_000, tokensOut: 0, cached: 500_000 })).toBeCloseTo(0.077, 6)
    process.env = antes
  })
})
