import { isAdmin } from '../lib/permissions.js'

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }

  next()
}
