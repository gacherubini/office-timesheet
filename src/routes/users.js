import { Router } from 'express'
import multer from 'multer'
import { query } from '../lib/db.js'
import { hashPassword } from '../lib/password.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
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
      return res.status(400).json({ error: 'Valor/hora não pode ser negativo.' })
    }

    if (Number(fixed_salary) < 0) {
      return res.status(400).json({ error: 'Salário fixo não pode ser negativo.' })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 6 caracteres.',
      })
    }

    const passwordHash = await hashPassword(password)

    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name, role, hourly_rate, fixed_salary,
                          is_active, position, birth_date, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, email, name, role, hourly_rate, fixed_salary, is_active`,
      [
        email.trim().toLowerCase(),
        passwordHash,
        name.trim(),
        role,
        role === ROLES.ADMINISTRATIVE_INTERN ? 0 : Number(hourly_rate) || 0,
        role === ROLES.ADMINISTRATIVE_INTERN ? Number(fixed_salary) || 0 : 0,
        is_active,
        roleLabel(role),
        birth_date || null,
        phone?.trim() || null,
      ],
    )

    const profile = rows[0]

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      user: {
        id: profile.id,
        email: profile.email,
      },
      profile,
    })
  } catch (err) {
    console.error('Erro em /create-user:', err)
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

  try {
    const { rows } = await query(
      `SELECT ${fields}
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    )
    return res.json(rows)
  } catch (err) {
    console.error('Erro em GET /users:', err)
    return res.status(400).json({ error: err.message })
  }
})

// ─── LISTAR USUÁRIOS DELETADOS ────────────────────────────────────────
router.get('/users/deleted', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, hourly_rate, fixed_salary, deleted_at, created_at
       FROM users
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
    )
    return res.json(rows)
  } catch (err) {
    console.error('Erro em GET /users/deleted:', err)
    return res.status(400).json({ error: err.message })
  }
})

// ─── RESTAURAR USUÁRIO ────────────────────────────────────────────────
router.post('/users/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  try {
    const { rows } = await query(
      `UPDATE users
       SET deleted_at = NULL, is_active = true
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, name, email, role, hourly_rate, fixed_salary, is_active`,
      [id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Usuário deletado não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em POST /users/:id/restore:', err)
    return res.status(400).json({ error: err.message })
  }
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
      return res.status(400).json({ error: 'Salário fixo não pode ser negativo.' })
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

  try {
    const setClauses = []
    const values = []
    let paramCount = 1

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    values.push(id)
    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING id, name, email, role, hourly_rate, fixed_salary, is_active`

    const { rows } = await query(sql, values)

    if (!rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em PUT /users/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

// ─── DELETAR USUÁRIO (soft delete) ────────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  if (id === req.profile.id) {
    return res.status(400).json({ error: 'Você não pode deletar sua própria conta.' })
  }

  try {
    const { rows } = await query(
      `UPDATE users
       SET deleted_at = now(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    )

    if (!rows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado ou já deletado.' })
    }

    return res.status(204).send()
  } catch (err) {
    console.error('Erro em DELETE /users/:id:', err)
    return res.status(400).json({ error: err.message })
  }
})

// ─── UPLOAD DE AVATAR ─────────────────────────────────────────────────
router.post('/users/:id/avatar', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  try {
    const { rows: profileRows } = await query(
      'SELECT id, avatar_url FROM users WHERE id = $1',
      [id],
    )

    if (!profileRows[0]) {
      return res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    const profile = profileRows[0]

    // Deletar avatar antigo se existir
    if (profile.avatar_url) {
      const oldKey = extractKeyFromUrl(profile.avatar_url)
      if (oldKey) {
        await deleteFile(oldKey)
      }
    }

    // Upload novo avatar
    const { url } = await uploadFile('avatars', {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    })

    // Atualizar usuário com nova URL
    const { rows } = await query(
      `UPDATE users
       SET avatar_url = $1
       WHERE id = $2
       RETURNING id, name, email, role, hourly_rate, fixed_salary, is_active, position, birth_date, phone, avatar_url`,
      [url, id],
    )

    return res.json(rows[0])
  } catch (err) {
    console.error('Erro em POST /users/:id/avatar:', err)
    return res.status(400).json({ error: err.message })
  }
})

export default router
