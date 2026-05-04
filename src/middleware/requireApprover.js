import { canApproveRequests } from '../lib/permissions.js'

export function requireApprover(req, res, next) {
  if (!canApproveRequests(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito a aprovadores.' })
  }

  next()
}
