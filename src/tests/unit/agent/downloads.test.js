import { describe, it, expect } from 'vitest'
import { remember, get, pendingCount, DOWNLOAD_TTL_MS, DOWNLOAD_MAX_BYTES } from '../../../lib/agent/downloads.js'

const admin = { id: '1', role: 'admin' }
const outro = { id: '2', role: 'admin' }

describe('downloads — Map em memória, TTL, vários gets', () => {
  it('guarda e devolve o buffer para o dono', () => {
    const buf = Buffer.from('hello')
    const { token } = remember({ profile: admin, buffer: buf, filename: 'a.csv', mime: 'text/csv', now: 1000 })
    const got = get(token, admin, 1000)
    expect(got.filename).toBe('a.csv')
    expect(got.mime).toBe('text/csv')
    expect(Buffer.compare(got.buffer, buf)).toBe(0)
  })

  it('segundo get no TTL ainda funciona', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, admin, 1000)).not.toBeNull()
    expect(get(token, admin, 1000)).not.toBeNull()
  })

  it('nega outro usuário', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, outro, 1000)).toBeNull()
  })

  it('nega se o papel mudou', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, { id: '1', role: 'employee' }, 1000)).toBeNull()
  })

  it('expira após o TTL', () => {
    const { token } = remember({ profile: admin, buffer: Buffer.from('x'), filename: 'a.csv', mime: 'text/csv', now: 1000 })
    expect(get(token, admin, 1000 + DOWNLOAD_TTL_MS + 1)).toBeNull()
  })

  it('recusa buffer acima de 10 MB', () => {
    const grande = Buffer.alloc(DOWNLOAD_MAX_BYTES + 1)
    expect(() => remember({ profile: admin, buffer: grande, filename: 'a.bin', mime: 'application/octet-stream', now: 1000 }))
      .toThrow(/grande demais/i)
  })

  it('expurga vencidos ao criar o próximo', () => {
    const base = 20_000_000
    remember({ profile: admin, buffer: Buffer.from('a'), filename: 'a.csv', mime: 'text/csv', now: base })
    remember({ profile: admin, buffer: Buffer.from('b'), filename: 'b.csv', mime: 'text/csv', now: base + DOWNLOAD_TTL_MS + 1 })
    expect(pendingCount()).toBe(1)
  })
})
