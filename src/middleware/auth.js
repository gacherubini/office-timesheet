import { verifyAccessToken } from '../lib/jwt.js'
import { query } from '../lib/db.js'

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token ausente.' })
    }

    const token = authHeader.slice('Bearer '.length).trim()
    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return res.status(401).json({ error: 'Token inválido.' })
    }

    const { rows } = await query(
      `SELECT id, name, email, role, is_active, deleted_at, position,
              birth_date, phone, avatar_url
         FROM users
        WHERE id = $1`,
      [payload.sub],
    )
    const profile = rows[0]

    if (!profile) return res.status(403).json({ error: 'Perfil não encontrado.' })
    if (profile.deleted_at) return res.status(403).json({ error: 'Usuário deletado.' })
    if (!profile.is_active) return res.status(403).json({ error: 'Usuário inativo.' })

    req.accessToken = token
    req.authUser = { id: profile.id, email: profile.email }
    req.profile = profile
    next()
  } catch (err) {
    console.error('Erro em requireAuth:', err)
    return res.status(500).json({ error: 'Erro interno na autenticação.' })
  }
}
