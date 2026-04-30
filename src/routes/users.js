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
      position,
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
        ...(position !== undefined && { position: position.trim() }),
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

// ─── LISTAR USUÁRIOS (apenas não deletados) ───────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, name, email, role, hourly_rate, is_active, position, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

// ─── LISTAR USUÁRIOS DELETADOS ────────────────────────────────────────
router.get('/users/deleted', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, name, email, role, hourly_rate, deleted_at, created_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

// ─── RESTAURAR USUÁRIO ────────────────────────────────────────────────
router.post('/users/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  const { data, error } = await adminClient
    .from('profiles')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id, name, email, role, hourly_rate, is_active')
    .maybeSingle()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  if (!data) {
    return res.status(404).json({ error: 'Usuário deletado não encontrado.' })
  }

  return res.json(data)
})

// ─── EDITAR USUÁRIO ───────────────────────────────────────────────────
router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { name, role, hourly_rate, is_active, position } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (position !== undefined) updates.position = position.trim()
  if (role !== undefined) {
    if (!['admin', 'employee'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida.' })
    }
    updates.role = role
  }
  if (hourly_rate !== undefined) {
    if (Number(hourly_rate) < 0) {
      return res.status(400).json({ error: 'Valor/hora não pode ser negativo.' })
    }
    updates.hourly_rate = hourly_rate
  }
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  const { data, error } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, role, hourly_rate, is_active')
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

// ─── DELETAR USUÁRIO (soft delete) ────────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  if (id === req.profile.id) {
    return res.status(400).json({ error: 'Você não pode deletar sua própria conta.' })
  }

  const { data, error } = await adminClient
    .from('profiles')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  if (!data) {
    return res.status(404).json({ error: 'Usuário não encontrado ou já deletado.' })
  }

  return res.status(204).send()
})

export default router