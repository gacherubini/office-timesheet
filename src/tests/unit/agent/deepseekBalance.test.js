import { describe, it, expect, afterEach, vi } from 'vitest'
import { getBalance, BalanceIndisponivel } from '../../../lib/agent/deepseekBalance.js'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.AGENT_API_KEY })

describe('getBalance', () => {
  it('parseia a resposta do /user/balance', async () => {
    process.env.AGENT_API_KEY = 'sk-x'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '12.50', granted_balance: '2.00', topped_up_balance: '10.50' }] }),
    })))
    const b = await getBalance()
    expect(b).toEqual({ disponivel: true, moeda: 'USD', total: 12.5, concedido: 2, recarga: 10.5 })
  })

  it('sem AGENT_API_KEY, lança BalanceIndisponivel', async () => {
    delete process.env.AGENT_API_KEY
    await expect(getBalance()).rejects.toBeInstanceOf(BalanceIndisponivel)
  })

  it('provedor sem o endpoint (404) lança BalanceIndisponivel', async () => {
    process.env.AGENT_API_KEY = 'sk-x'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(getBalance()).rejects.toBeInstanceOf(BalanceIndisponivel)
  })
})
