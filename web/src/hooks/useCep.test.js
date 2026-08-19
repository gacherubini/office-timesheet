import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buscarCep, apenasDigitos } from './useCep'

describe('apenasDigitos', () => {
  it('tira máscara do CEP', () => {
    expect(apenasDigitos('01310-100')).toBe('01310100')
    expect(apenasDigitos('01310 100')).toBe('01310100')
  })
})

describe('buscarCep', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('devolve os campos do ViaCEP', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista',
        localidade: 'São Paulo', uf: 'SP',
      }),
    })
    const r = await buscarCep('01310-100')
    expect(r.ok).toBe(true)
    expect(r.dados).toEqual({
      cep: '01310-100', street: 'Avenida Paulista', district: 'Bela Vista',
      city: 'São Paulo', uf: 'SP',
    })
  })

  it('chama a URL do ViaCEP com o CEP sem máscara', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ cep: '01310-100' }) })
    await buscarCep('01310-100')
    expect(global.fetch.mock.calls[0][0]).toBe('https://viacep.com.br/ws/01310100/json/')
  })

  it('CEP inexistente ({erro:true}) NÃO é falha — libera manual', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ erro: true }) })
    const r = await buscarCep('00000000')
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/não encontrado/i)
  })

  it('erro de rede não estoura — devolve motivo', async () => {
    global.fetch.mockRejectedValue(new Error('offline'))
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
    expect(r.motivo).toBeTruthy()
  })

  it('resposta 500 não estoura', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
  })

  it('CEP incompleto nem chega a chamar a rede', async () => {
    const r = await buscarCep('0131')
    expect(r.ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('abort não vira erro de tela', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
    expect(r.abortado).toBe(true)
  })
})
