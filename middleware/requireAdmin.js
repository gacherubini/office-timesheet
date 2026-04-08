export function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }

  next()
}