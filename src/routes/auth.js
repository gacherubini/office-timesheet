import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { query } from '../lib/db.js'
import { comparePassword, hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'
import { sendResetEmail } from '../lib/email.js'

const router = Router()

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

router.post('/auth/login', async (req, res) => {
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

    if (!user || !user.is_active || user.deleted_at) {
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    const ok = await comparePassword(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' })

    const access_token = signAccessToken(user)
    return res.json({
      access_token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (err) {
    console.error('Erro em /auth/login:', err)
    return res.status(500).json({ error: 'Erro interno no login.' })
  }
})

router.post('/auth/forgot-password', async (req, res) => {
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
      await sendResetEmail(email, `${frontendUrl}/reset-password?token=${token}`)
    }

    // Sempre responde igual pra não vazar enumeração
    return res.json({ message: 'Se o email existir, você receberá um link de redefinição.' })
  } catch (err) {
    console.error('Erro em /auth/forgot-password:', err)
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

router.post('/auth/reset-password', async (req, res) => {
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
    await query(
      `UPDATE users
          SET password_hash = $1,
              password_reset_token = NULL,
              password_reset_expires_at = NULL
        WHERE id = $2`,
      [hash, user.id],
    )

    return res.json({ message: 'Senha redefinida com sucesso.' })
  } catch (err) {
    console.error('Erro em /auth/reset-password:', err)
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

export default router