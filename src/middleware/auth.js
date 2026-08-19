import { verifyAccessToken } from '../lib/jwt.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getCachedProfile, setCachedProfile } from '../lib/userCache.js'
import { marcarVisto } from '../lib/onlineUsers.js'

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

    // Cache em memória: evita 1 SELECT por request autenticado. Invalidado em
    // todo caminho que altera o perfil (routes/users.js, me.js, auth.js) e com
    // TTL de rede de segurança. Ver lib/userCache.js.
    let profile = getCachedProfile(payload.sub)
    if (!profile) {
      const { rows } = await query(
        `SELECT id, name, email, role, is_active, deleted_at, position,
                birth_date, phone, avatar_url, sessions_valid_after
           FROM users
          WHERE id = $1`,
        [payload.sub],
      )
      profile = rows[0]
      if (profile) setCachedProfile(payload.sub, profile)
    }

    if (!profile) return res.status(403).json({ error: 'Perfil não encontrado.' })
    if (profile.deleted_at) return res.status(403).json({ error: 'Usuário deletado.' })
    if (!profile.is_active) return res.status(403).json({ error: 'Usuário inativo.' })

    // Reset de senha (e futuros "logout em todos") invalidam JWTs anteriores.
    // iat do JWT é em segundos; usa <= pra cobrir token emitido no mesmo segundo do reset.
    if (profile.sessions_valid_after && payload.iat) {
      const validAfterMs = new Date(profile.sessions_valid_after).getTime()
      if (Number.isFinite(validAfterMs) && validAfterMs > 0 && payload.iat * 1000 <= validAfterMs) {
        return res.status(401).json({ error: 'Sessão invalidada. Faça login novamente.' })
      }
    }

    req.accessToken = token
    req.authUser = { id: profile.id, email: profile.email }
    req.profile = profile
    // Presença: depois de todas as guardas, para que 401/403 não conte como
    // "online". É um Map.set em memória — nada de I/O neste caminho.
    marcarVisto(profile.id)
    next()
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em requireAuth')
    return res.status(500).json({ error: 'Erro interno na autenticação.' })
  }
}
