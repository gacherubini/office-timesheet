import { describe, it, expect, afterEach } from 'vitest'
import { truncarResultado } from '../../../lib/agent/loop.js'

describe('truncarResultado', () => {
  const original = process.env.AGENT_MAX_TOOL_RESULT_CHARS
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
    else process.env.AGENT_MAX_TOOL_RESULT_CHARS = original
  })

  it('deixa passar resultado dentro do teto, byte a byte', () => {
    const json = JSON.stringify([{ a: 1 }, { a: 2 }])
    expect(truncarResultado(json, 1000)).toBe(json)
  })

  it('corta o que passa do teto e explica o corte em português', () => {
    const json = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ nome: `pessoa ${i}` })))
    const cortado = truncarResultado(json, 200)
    expect(cortado.length).toBeLessThan(json.length)
    expect(cortado.startsWith(json.slice(0, 200))).toBe(true)
    expect(cortado).toContain('resultado cortado')
    // O modelo precisa saber o tamanho real para julgar se vale refinar a consulta.
    expect(cortado).toContain(String(json.length))
  })

  it('o teto vem de AGENT_MAX_TOOL_RESULT_CHARS quando não é passado', () => {
    process.env.AGENT_MAX_TOOL_RESULT_CHARS = '50'
    const json = JSON.stringify(Array.from({ length: 100 }, (_, i) => i))
    expect(truncarResultado(json)).toContain('resultado cortado')
  })

  it('teto ausente cai no default de 20000', () => {
    delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
    const json = 'x'.repeat(19_999)
    expect(truncarResultado(json)).toBe(json)
    expect(truncarResultado('x'.repeat(20_001))).toContain('resultado cortado')
  })
})
