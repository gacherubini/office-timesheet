import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { marcarVisto, usuariosOnline, limparOnline } from '../../lib/onlineUsers.js'

describe('onlineUsers', () => {
  const prevJanela = process.env.PRESENCE_WINDOW_MS

  beforeEach(() => {
    limparOnline()
    delete process.env.PRESENCE_WINDOW_MS
  })

  afterEach(() => {
    vi.useRealTimers()
    if (prevJanela === undefined) delete process.env.PRESENCE_WINDOW_MS
    else process.env.PRESENCE_WINDOW_MS = prevJanela
  })

  it('quem foi marcado aparece em usuariosOnline()', () => {
    marcarVisto('u1')
    expect(usuariosOnline().has('u1')).toBe(true)
  })

  it('quem nunca foi marcado não aparece', () => {
    marcarVisto('u1')
    expect(usuariosOnline().has('u2')).toBe(false)
  })

  it('some depois da janela de 5 minutos', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(5 * 60_000 + 1)
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('continua dentro da janela e o sinal novo renova', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(4 * 60_000)
    expect(usuariosOnline().has('u1')).toBe(true)
    marcarVisto('u1')
    vi.advanceTimersByTime(4 * 60_000)
    expect(usuariosOnline().has('u1')).toBe(true)
  })

  // A poda preguiçosa é o que impede o Map de crescer para sempre num processo
  // que fica meses de pé. Sem ela, todo usuário que já logou uma vez ficaria
  // guardado — e o vazamento só apareceria em produção, muito depois.
  it('poda o vencido do Map, não só do resultado', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(5 * 60_000 + 1)
    usuariosOnline() // dispara a poda
    // Volta no tempo: se o registro ainda estivesse no Map, ele reapareceria.
    vi.setSystemTime(new Date(Date.now() - 5 * 60_000))
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('a janela é lida em call-time via PRESENCE_WINDOW_MS', () => {
    vi.useFakeTimers()
    process.env.PRESENCE_WINDOW_MS = '1000'
    marcarVisto('u1')
    vi.advanceTimersByTime(1001)
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('id vazio não cria entrada', () => {
    marcarVisto(undefined)
    marcarVisto(null)
    marcarVisto('')
    expect(usuariosOnline().size).toBe(0)
  })

  it('limparOnline zera tudo', () => {
    marcarVisto('u1')
    limparOnline()
    expect(usuariosOnline().size).toBe(0)
  })
})
