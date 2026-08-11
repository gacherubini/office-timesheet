import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { query } from '../lib/db.js'
import { comparePassword, hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'
import { sendResetEmail } from '../lib/email.js'
import { logger } from '../lib/logger.js'
import { rateLimit } from '../lib/rateLimit.js'
import { invalidateUser } from '../lib/userCache.js'

const router = Router()

// Hash dummy (bcrypt de "invalid") pra equalizar tempo quando o usuário não existe.
const DUMMY_PASSWORD_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012'

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 })

router.post('/auth/login', authRateLimit, async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password são obrigatórios.' })
    }

    const { rows } = await query(
      `SELECT id, email, password_hash, name, role, is_active, deleted_at
         FROM users
        WHERE lower(email) = $1`,
      [email],
    )
    const user = rows[0]

    // Sempre roda bcrypt (hash real ou dummy) pra não vazar existência por timing.
    const hash = user?.password_hash || DUMMY_PASSWORD_HASH
    const ok = await comparePassword(password, hash)

    if (!user || !user.is_active || user.deleted_at || !ok) {
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    const access_token = signAccessToken(user)
    return res.json({
      access_token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em /auth/login')
    return res.status(500).json({ error: 'Erro interno no login.' })
  }
})

router.post('/auth/forgot-password', authRateLimit, async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!email) return res.status(400).json({ error: 'Email é obrigatório.' })

    const token = randomBytes(32).toString('hex')
    const tokenHash = sha256Hex(token)

    const { rowCount } = await query(
      `UPDATE users
          SET password_reset_token = $1,
              password_reset_expires_at = now() + interval '1 hour'
        WHERE lower(email) = $2 AND deleted_at IS NULL AND is_active = true`,
      [tokenHash, email],
    )

    if (rowCount > 0) {
      const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '')
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`
      await sendResetEmail(email, resetUrl)
    }

    // Sempre responde igual pra não vazar enumeração
    return res.json({ message: 'Se o email existir, você receberá um link de redefinição.' })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em /auth/forgot-password')
    // Em produção, falha de e-mail/config não pode virar "enviado" silencioso.
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

router.post('/auth/reset-password', authRateLimit, async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
    }

    const tokenHash = sha256Hex(token)
    const { rows } = await query(
      `SELECT id FROM users
        WHERE password_reset_token = $1
          AND password_reset_expires_at > now()
          AND deleted_at IS NULL AND is_active = true`,
      [tokenHash],
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Token inválido ou expirado.' })

    const hash = await hashPassword(newPassword)
    // sessions_valid_after = now() invalida JWTs emitidos antes do reset.
    await query(
      `UPDATE users
          SET password_hash = $1,
              password_reset_token = NULL,
              password_reset_expires_at = NULL,
              sessions_valid_after = now()
        WHERE id = $2`,
      [hash, user.id],
    )

    // Crítico: sessions_valid_after mudou. Sem invalidar, o requireAuth serviria
    // o perfil antigo (do cache) e um JWT anterior ao reset continuaria valendo
    // até o TTL expirar.
    invalidateUser(user.id)

    return res.json({ message: 'Senha redefinida com sucesso.' })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em /auth/reset-password')
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

export default router