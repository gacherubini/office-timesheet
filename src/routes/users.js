import { Router } from 'express'
import multer from 'multer'
import { adminClient } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireOperationalAccess } from '../middleware/requireOperationalAccess.js'
import { ROLES, VALID_ROLES, canAccessMoney, roleLabel } from '../lib/permissions.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Apenas imagens são permitidas.'))
  },
})

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
      hourly_rate = 0,
      fixed_salary = 0,
      is_active = true,
      position,
      birth_date,
      phone,
    } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email e password são obrigatórios.',
      })
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: 'Role inválida.',
      })
    }

    if (Number(hourly_rate) < 0) {
      return res.status(400).json({ error: 'Valor/hora nÃ£o pode ser negativo.' })
    }

    if (Number(fixed_salary) < 0) {
      return res.status(400).json({ error: 'SalÃ¡rio fixo nÃ£o pode ser negativo.' })
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
        hourly_rate: role === ROLES.ADMINISTRATIVE_INTERN ? 0 : Number(hourly_rate) || 0,
        fixed_salary: role === ROLES.ADMINISTRATIVE_INTERN ? Number(fixed_salary) || 0 : 0,
        is_active,
        position: roleLabel(role),
        ...(birth_date !== undefined && { birth_date: birth_date || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
      })
      .eq('id', userId)
      .select('id, name, email, role, hourly_rate, fixed_salary, is_active')
      .single()

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId)

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
router.get('/users', requireAuth, requireOperationalAccess, async (req, res) => {
  const fields = canAccessMoney(req.profile)
    ? 'id, name, email, role, hourly_rate, fixed_salary, is_active, position, birth_date, phone, avatar_url, created_at'
    : 'id, name, email, role, is_active, position, birth_date, phone, avatar_url, created_at'

  const { data, error } = await adminClient
    .from('profiles')
    .select(fields)
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
    .select('id, name, email, role, hourly_rate, fixed_salary, deleted_at, created_at')
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
    .select('id, name, email, role, hourly_rate, fixed_salary, is_active')
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
  const { name, role, hourly_rate, fixed_salary, is_active, position, birth_date, phone } = req.body

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválida.' })
    }
    updates.role = role
    updates.position = roleLabel(role)
    if (role === ROLES.ADMINISTRATIVE_INTERN) {
      updates.hourly_rate = 0
    } else {
      updates.fixed_salary = 0
    }
  }
  if (hourly_rate !== undefined) {
    if (Number(hourly_rate) < 0) {
      return res.status(400).json({ error: 'Valor/hora não pode ser negativo.' })
    }
    if (role !== ROLES.ADMINISTRATIVE_INTERN && updates.role !== ROLES.ADMINISTRATIVE_INTERN) {
      updates.hourly_rate = Number(hourly_rate) || 0
    }
  }
  if (fixed_salary !== undefined) {
    if (Number(fixed_salary) < 0) {
      return res.status(400).json({ error: 'SalÃ¡rio fixo nÃ£o pode ser negativo.' })
    }
    if (role === ROLES.ADMINISTRATIVE_INTERN || updates.role === ROLES.ADMINISTRATIVE_INTERN) {
      updates.fixed_salary = Number(fixed_salary) || 0
    }
  }
  if (is_active !== undefined) updates.is_active = is_active
  if (birth_date !== undefined) updates.birth_date = birth_date || null
  if (phone !== undefined) updates.phone = phone?.trim() || null

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  const { data, error } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, role, hourly_rate, fixed_salary, is_active')
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

// ─── UPLOAD DE AVATAR ─────────────────────────────────────────────────
router.post('/users/:id/avatar', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, avatar_url')
    .eq('id', id)
    .single()

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Usuário não encontrado.' })
  }

  if (profile.avatar_url) {
    const oldPath = profile.avatar_url.split('/user-avatars/')[1]
    if (oldPath) {
      await adminClient.storage.from('user-avatars').remove([oldPath])
    }
  }

  const ext = req.file.originalname.split('.').pop()
  const fileName = `${id}-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage
    .from('user-avatars')
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    })

  if (uploadError) {
    return res.status(400).json({ error: uploadError.message })
  }

  const { data: urlData } = adminClient.storage
    .from('user-avatars')
    .getPublicUrl(fileName)

  const avatarUrl = urlData.publicUrl

  const { data, error } = await adminClient
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', id)
    .select('id, name, email, role, hourly_rate, fixed_salary, is_active, position, birth_date, phone, avatar_url')
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

export default router
