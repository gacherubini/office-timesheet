import { canAccessMoney } from '../lib/permissions.js'

export function requireMoneyAccess(req, res, next) {
  if (!canAccessMoney(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a administradores financeiros.' })
  }

  next()
}
