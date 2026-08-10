import { describe, it, expect } from 'vitest'
import { assertSafeUploadMime } from '../../lib/storage.js'

describe('storage — MIME allowlist', () => {
  it('bloqueia SVG/HTML (stored XSS)', () => {
    expect(() => assertSafeUploadMime('image/svg+xml')).toThrow(/não permitido/i)
    expect(() => assertSafeUploadMime('text/html')).toThrow(/não permitido/i)
    expect(() => assertSafeUploadMime('application/xhtml+xml')).toThrow(/não permitido/i)
  })

  it('aceita imagens e pdf comuns', () => {
    expect(assertSafeUploadMime('image/png')).toBe('image/png')
    expect(assertSafeUploadMime('image/jpeg')).toBe('image/jpeg')
    expect(assertSafeUploadMime('application/pdf')).toBe('application/pdf')
  })
})
