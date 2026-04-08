import { Router } from 'express'
import { adminClient } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

router.get('/ping', (req, res) => {
  res.json({ ok: true, route: '/admin/ping' })
})

router.post('/create-user', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'employee',
      is_active = true,
    } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email e password são obrigatórios.',
      })
    }

    if (!['admin', 'employee'].includes(role)) {
      return res.status(400).json({
        error: 'Role inválida.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 6 caracteres.',
      })
    }

    const { data: createdUserData, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          name: name.trim(),
        },
      })

    if (createUserError || !createdUserData?.user) {
      return res.status(400).json({
        error: createUserError?.message || 'Erro ao criar usuário no Auth.',
      })
    }

    const userId = createdUserData.user.id

    // como teu trigger já cria a linha em public.profiles,
    // aqui só ajustamos os campos finais do sistema
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        is_active,
      })
      .eq('id', userId)
      .select('id, name, email, role, is_active')
      .single()

    if (profileError) {
      return res.status(500).json({
        error: 'Usuário criado no Auth, mas falhou ao atualizar profile.',
        details: profileError.message,
        user_id: userId,
      })
    }

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      user: {
        id: createdUserData.user.id,
        email: createdUserData.user.email,
      },
      profile,
    })
  } catch (err) {
    return res.status(500).json({
      error: 'Erro interno ao criar usuário.',
    })
  }
})

export default router