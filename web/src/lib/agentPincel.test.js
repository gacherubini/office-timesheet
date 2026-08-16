import { describe, it, expect } from 'vitest'
import { criarPincel } from './agentPincel.js'

function fakeRelogio() {
  const fila = []
  let seq = 0
  const schedule = (fn, ms) => {
    const id = ++seq
    fila.push({ id, fn, ms })
    return id
  }
  const cancel = (id) => {
    const i = fila.findIndex((t) => t.id === id)
    if (i >= 0) fila.splice(i, 1)
  }
  const avancar = () => {
    const t = fila.shift()
    if (t) t.fn()
    return t?.ms
  }
  return { schedule, cancel, avancar, pendentes: () => fila.slice() }
}

describe('criarPincel — ritmo da bolha', () => {
  it('primeiro pedaço pinta na hora; o resto espera o tick', () => {
    const relogio = fakeRelogio()
    const pinturas = []
    const p = criarPincel({
      charsPerTick: 3,
      tickMs: 50,
      schedule: relogio.schedule,
      cancel: relogio.cancel,
      onPaint: (s) => pinturas.push(s.texto),
    })
    p.empurrar('Olá mundo')
    expect(pinturas.at(-1)).toBe('Olá')
    expect(relogio.avancar()).toBe(50)
    expect(pinturas.at(-1)).toBe('Olá mu')
  })

  it('revogar apaga o visível e cancela o que estava na fila', () => {
    const relogio = fakeRelogio()
    const pinturas = []
    const p = criarPincel({
      charsPerTick: 2,
      tickMs: 50,
      schedule: relogio.schedule,
      cancel: relogio.cancel,
      onPaint: (s) => pinturas.push(s.texto),
    })
    p.empurrar('pensando bastante')
    p.revogar()
    expect(pinturas.at(-1)).toBe('')
    expect(relogio.pendentes()).toEqual([])
  })

  it('fechar com o texto canônico só pinta o que ainda faltava', () => {
    const relogio = fakeRelogio()
    const pinturas = []
    const p = criarPincel({
      charsPerTick: 4,
      tickMs: 50,
      schedule: relogio.schedule,
      cancel: relogio.cancel,
      onPaint: (s) => pinturas.push(s.texto),
    })
    p.empurrar('Olá, ')
    expect(pinturas.at(-1)).toBe('Olá,')
    p.fechar('Olá, tudo bem?')
    while (relogio.pendentes().length) relogio.avancar()
    expect(pinturas.at(-1)).toBe('Olá, tudo bem?')
  })

  it('despejar revela o resto na hora e libera quandoParar', async () => {
    const relogio = fakeRelogio()
    const pinturas = []
    const p = criarPincel({
      charsPerTick: 2,
      tickMs: 50,
      schedule: relogio.schedule,
      cancel: relogio.cancel,
      onPaint: (s) => pinturas.push(s.texto),
    })
    p.empurrar('Olá mundo')
    const done = p.quandoParar()
    p.despejar()
    await done
    expect(pinturas.at(-1)).toBe('Olá mundo')
    expect(relogio.pendentes()).toEqual([])
  })

  it('quandoParar resolve depois do último tick', async () => {
    const relogio = fakeRelogio()
    const p = criarPincel({
      charsPerTick: 3,
      tickMs: 50,
      schedule: relogio.schedule,
      cancel: relogio.cancel,
      onPaint: () => {},
    })
    p.empurrar('abcdef')
    let acabou = false
    const done = p.quandoParar().then(() => { acabou = true })
    expect(acabou).toBe(false)
    while (relogio.pendentes().length) relogio.avancar()
    await done
    expect(acabou).toBe(true)
  })
})
