import { canAccessOperations } from '../lib/permissions.js'

export function requireOperationalAccess(req, res, next) {
  if (!canAccessOperations(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a operação.' })
  }

  next()
}
