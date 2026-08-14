import supertest from 'supertest'
import { app } from '../../app.js'
import { signAccessToken } from '../../lib/jwt.js'

export const request = supertest(app)

// Token JWT válido pro usuário (mesma função que a API usa pra assinar).
export function tokenFor(user) {
  return signAccessToken(user)
}

// Açúcar: request autenticado. Ex.: await asUser(u).get('/me/stats')
export function asUser(user) {
  const token = tokenFor(user)
  const auth = (req) => req.set('Authorization', `Bearer ${token}`)
  return {
    get: (url) => auth(request.get(url)),
    post: (url) => auth(request.post(url)),
    put: (url) => auth(request.put(url)),
    patch: (url) => auth(request.patch(url)),
    delete: (url) => auth(request.delete(url)),
  }
}
