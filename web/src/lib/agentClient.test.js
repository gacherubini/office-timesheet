import { describe, it, expect } from 'vitest'
import { parseSseBuffer, buildChatRequest, readErrorMessage } from './agentClient.js'

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

describe('buildChatRequest', () => {
  it('sem arquivo: corpo JSON com message e conversation_id', () => {
    const { headers, body } = buildChatRequest({ message: 'oi', conversationId: 'c1', token: 't' })
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(body)).toEqual({ message: 'oi', conversation_id: 'c1' })
  })

  it('sem token: não manda Authorization', () => {
    const { headers } = buildChatRequest({ message: 'oi', token: null })
    expect(headers.Authorization).toBeUndefined()
  })

  it('com arquivo: FormData com file e message, e sem Content-Type manual', () => {
    const file = new File(['abc'], 'brief.txt', { type: 'text/plain' })
    const { headers, body } = buildChatRequest({ message: 'lê', conversationId: 'c1', file, token: 't' })
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('message')).toBe('lê')
    expect(body.get('conversation_id')).toBe('c1')
    expect(body.get('file')).toBe(file)
    // Content-Type é definido pelo browser (com o boundary do multipart).
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers.Authorization).toBe('Bearer t')
  })
})

describe('readErrorMessage', () => {
  it('usa o campo error do corpo JSON', async () => {
    const msg = await readErrorMessage({ json: async () => ({ error: 'Formato não suportado.' }) })
    expect(msg).toBe('Formato não suportado.')
  })

  it('cai no fallback quando o corpo não é JSON', async () => {
    const msg = await readErrorMessage({ json: async () => { throw new Error('sem json') } })
    expect(msg).toMatch(/falha/i)
  })
})
