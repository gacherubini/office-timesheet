import { Router } from 'express'
import { authClient, adminClient } from '../lib/supabase.js'

const router = Router()

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email e password são obrigatórios.'
      })
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return res.status(401).json({
        error: error.message
      })
    }

    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: data.user
    })
  } catch (err) {
    return res.status(500).json({
      error: 'Erro interno no login.'
    })
  }
})

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório.' })
    }

    const frontendUrl = process.env.FRONTEND_URL
    await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${frontendUrl}/reset-password`,
    })

    // Sempre retorna 200 para não revelar se o email existe
    return res.json({ message: 'Se o email existir, você receberá um link de redefinição.' })
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

router.post('/auth/reset-password', async (req, res) => {
  try {
    const { accessToken, newPassword } = req.body

    if (!accessToken || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
    }

    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken)

    if (userError || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' })
    }

    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ message: 'Senha redefinida com sucesso.' })
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno.' })
  }
})

export default router