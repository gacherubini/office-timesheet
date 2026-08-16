import { describe, it, expect } from 'vitest'
import { request } from '../helpers/api.js'

describe('express.json — teto de corpo', () => {
  it('recusa JSON maior que 256kb com 413', async () => {
    const res = await request
      .post('/auth/login')
      .send({ email: 'a@b.c', password: 'x'.repeat(300_000) })
    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/grande demais/i)
  })
})
