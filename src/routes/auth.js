import { Router } from 'express'
import { authClient } from '../lib/supabase.js'

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

export default router