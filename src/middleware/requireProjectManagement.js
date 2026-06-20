import { canManageProjects } from '../lib/permissions.js'

// Gestão de projetos e templates: admin + Gestor de Projetos.
export function requireProjectManagement(req, res, next) {
  if (!canManageProjects(req.profile)) {
    return res.status(403).json({ error: 'Acesso restrito à gestão de projetos.' })
  }

  next()
}
