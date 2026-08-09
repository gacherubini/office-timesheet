import { describe, it, expect } from 'vitest'
import { loadSession, saveTurn, MAX_TURNS, SESSION_TTL_MS } from '../../../lib/agent/session.js'

const emp = { id: 1, role: 'employee' }

describe('session — memória efêmera com TTL e carimbo de papel', () => {
  it('sem conversation_id abre sessão nova com id', () => {
    const s = loadSession(undefined, emp, 1000)
    expect(s.id).toBeTruthy()
    expect(s.messages).toEqual([])
  })

  it('retoma a mesma conversa dentro do TTL', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, emp, 1000 + SESSION_TTL_MS - 1)
    expect(b.id).toBe(a.id)
    expect(b.messages).toHaveLength(1)
  })

  it('expira por inatividade → sessão nova, sem histórico', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, emp, 1000 + SESSION_TTL_MS + 1)
    expect(b.id).not.toBe(a.id)
    expect(b.messages).toEqual([])
  })

  it('descarta a sessão se o papel mudou', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, { id: 1, role: 'admin' }, 1200)
    expect(b.id).not.toBe(a.id)
    expect(b.messages).toEqual([])
  })

  it('apara para as últimas MAX_TURNS*2 mensagens', () => {
    const a = loadSession(undefined, emp, 1000)
    for (let i = 0; i < MAX_TURNS * 3; i++) saveTurn(a.id, emp, [{ role: 'user', content: String(i) }], 1000)
    const b = loadSession(a.id, emp, 1000)
    expect(b.messages.length).toBeLessThanOrEqual(MAX_TURNS * 2)
  })
})
