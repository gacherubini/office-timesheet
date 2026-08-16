import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { insert } from '../../../lib/agent/usageRepo.js'
import { tetoDiarioUsd, gastoDoDia, estourouOrcamento } from '../../../lib/agent/orcamento.js'

const ENV = 'AGENT_DAILY_BUDGET_USD'

describe('tetoDiarioUsd', () => {
  const anterior = process.env[ENV]
  afterEach(() => {
    if (anterior === undefined) delete process.env[ENV]
    else process.env[ENV] = anterior
  })

  it('sem configurar, vale o default — o teto existe por omissão, não por lembrança', () => {
    delete process.env[ENV]
    expect(tetoDiarioUsd()).toBe(1)
  })

  it('número na env vira o teto', () => {
    process.env[ENV] = '0.25'
    expect(tetoDiarioUsd()).toBe(0.25)
  })

  it('"off" desliga o teto de forma explícita', () => {
    process.env[ENV] = 'off'
    expect(tetoDiarioUsd()).toBeNull()
  })

  it('lixo na env cai no default em vez de desligar sem querer', () => {
    process.env[ENV] = 'banana'
    expect(tetoDiarioUsd()).toBe(1)
  })

  it('zero é teto de verdade (bloqueia tudo), não desligamento', () => {
    process.env[ENV] = '0'
    expect(tetoDiarioUsd()).toBe(0)
  })
})

describe('gastoDoDia', () => {
  let user, outro
  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'admin' })
    outro = await makeUser({ role: 'admin', email: 'outro@x.com' })
    process.env.AGENT_PRICE_IN = '1'; process.env.AGENT_PRICE_OUT = '1'; process.env.AGENT_PRICE_CACHED = '0'
  })

  it('soma só o gasto do próprio usuário', async () => {
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0 })
    await insert({ profile: outro, model: 'x', tokensIn: 5_000_000, tokensOut: 0 })
    expect(await gastoDoDia(user.id)).toBeCloseTo(1, 6)
  })

  it('ignora o que foi gasto em outro dia', async () => {
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0 })
    await query(`UPDATE agent_usage SET created_at = now() - interval '2 days'`)
    expect(await gastoDoDia(user.id)).toBe(0)
  })

  it('sem uso nenhum, zero', async () => {
    expect(await gastoDoDia(user.id)).toBe(0)
  })

  // Sem preços configurados custo_usd é null: o teto simplesmente não trava.
  // Falhar aberto é a escolha certa — barrar o time por causa de um buraco de
  // configuração seria pior que a fatura que o teto evita.
  it('linha sem custo conhecido não conta', async () => {
    delete process.env.AGENT_PRICE_IN; delete process.env.AGENT_PRICE_OUT; delete process.env.AGENT_PRICE_CACHED
    await insert({ profile: user, model: 'x', tokensIn: 9_000_000, tokensOut: 0 })
    expect(await gastoDoDia(user.id)).toBe(0)
  })
})

describe('estourouOrcamento', () => {
  let user
  const anterior = process.env[ENV]
  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'admin' })
    process.env.AGENT_PRICE_IN = '1'; process.env.AGENT_PRICE_OUT = '1'; process.env.AGENT_PRICE_CACHED = '0'
  })
  afterEach(() => {
    if (anterior === undefined) delete process.env[ENV]
    else process.env[ENV] = anterior
  })

  it('abaixo do teto, passa', async () => {
    process.env[ENV] = '1'
    await insert({ profile: user, model: 'x', tokensIn: 500_000, tokensOut: 0 })
    expect(await estourouOrcamento(user.id)).toEqual({ estourou: false, gasto: 0.5, teto: 1 })
  })

  it('no teto exato, barra — o próximo turno passaria do limite', async () => {
    process.env[ENV] = '1'
    await insert({ profile: user, model: 'x', tokensIn: 1_000_000, tokensOut: 0 })
    expect((await estourouOrcamento(user.id)).estourou).toBe(true)
  })

  it('com o teto desligado nunca estoura, e nem consulta gasto', async () => {
    process.env[ENV] = 'off'
    await insert({ profile: user, model: 'x', tokensIn: 9_000_000, tokensOut: 0 })
    expect(await estourouOrcamento(user.id)).toEqual({ estourou: false, gasto: null, teto: null })
  })

  it('usuário sem id (teste de laço) não é barrado', async () => {
    process.env[ENV] = '0'
    expect((await estourouOrcamento(undefined)).estourou).toBe(false)
  })
})
