import { describe, it, expect } from 'vitest'
import { parseSseBuffer } from './agentClient.js'

describe('parseSseBuffer', () => {
  it('extrai frames completos e guarda o resto parcial', () => {
    const buf = 'data: {"type":"token","text":"oi"}\n\ndata: {"type":"done"}\n\ndata: {"type":"par'
    const { eventos, resto } = parseSseBuffer(buf)
    expect(eventos).toEqual([{ type: 'token', text: 'oi' }, { type: 'done' }])
    expect(resto).toBe('data: {"type":"par')
  })

  it('sem frame completo, tudo vira resto', () => {
    const { eventos, resto } = parseSseBuffer('data: {"type":"to')
    expect(eventos).toEqual([])
    expect(resto).toBe('data: {"type":"to')
  })
})
