import { Router } from 'express'
import multer from 'multer'
import { query } from '../lib/db.js'
import { hashPassword } from '../lib/password.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireOperationalAccess } from '../middleware/requireOperationalAccess.js'
import { ROLES, VALID_ROLES, canAccessMoney } from '../lib/permissions.js'
import { invalidateUser, invalidateUsersBasic } from '../lib/userCache.js'
import { logger } from '../lib/logger.js'

// is_active pode chegar como boolean, string ('true'/'false') ou número (0/1).
// Normaliza pra boolean real: sem isso `is_active: 0` driblava o self-lock (o
// guard só barrava `false`/'false') e ainda gravava o valor cru na coluna.
function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1'
}

// Cargo é o que a pessoa FAZ; role é o que ela PODE FAZER. São campos
// separados desde o item 5 do PDF de 18/08/2026 — antes disso, position era
// gravado como roleLabel(role), e por isso todo colaborador aparecia como
// "Colaborador". Ver docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md §6.
const CARGO_PADRAO = 'Arquiteto'

function optionalText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

// uuid casa case-insensitive no Postgres; o compare em JS tem que casar também,
// senão o mesmo id em outro case burla o self-lock mas ainda atualiza a linha.
function sameId(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase()
}

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
      admission_date,
      termination_date,
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
                          is_active, position, birth_date, admission_date, termination_date, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, email, name, role, hourly_rate, fixed_salary, is_active`,
      [
        email.trim().toLowerCase(),
        passwordHash,
        name.trim(),
        role,
        role === ROLES.ADMINISTRATIVE_INTERN ? 0 : Number(hourly_rate) || 0,
        role === ROLES.ADMINISTRATIVE_INTERN ? Number(fixed_salary) || 0 : 0,
        is_active,
        optionalText(position) || CARGO_PADRAO,
        birth_date || null,
        admission_date || null,
        termination_date || null,
        phone?.trim() || null,
      ],
    )

    const profile = rows[0]

    // Novo usuário passa a compor /users/basic.
    invalidateUsersBasic()

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      user: {
        id: profile.id,
        email: profile.email,
      },
      profile,
    })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em /create-user')
    return res.status(500).json({
      error: 'Erro interno ao criar usuário.',
    })
  }
})

// ─── LISTAR USUÁRIOS (apenas não deletados) ───────────────────────────
router.get('/users', requireAuth, requireOperationalAccess, async (req, res) => {
  const fields = canAccessMoney(req.profile)
    ? 'id, name, email, role, hourly_rate, fixed_salary, is_active, position, birth_date, admission_date, termination_date, phone, avatar_url, created_at'
    : 'id, name, email, role, is_active, position, birth_date, admission_date, termination_date, phone, avatar_url, created_at'

  try {
    const { rows } = await query(
      `SELECT ${fields}
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /users')
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
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /users/deleted')
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

    invalidateUser(id)
    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /users/:id/restore')
    return res.status(400).json({ error: err.message })
  }
})

// ─── EDITAR USUÁRIO ───────────────────────────────────────────────────
router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const {
    name, role, hourly_rate, fixed_salary, is_active, position,
    birth_date, admission_date, termination_date, phone,
  } = req.body

  // Admin não se auto-desativa nem troca o próprio papel (self-lock).
  if (sameId(id, req.profile.id)) {
    if (is_active !== undefined && !toBool(is_active)) {
      return res.status(400).json({ error: 'Você não pode desativar a própria conta.' })
    }
    if (role !== undefined && role !== req.profile.role) {
      return res.status(400).json({ error: 'Você não pode alterar o próprio papel.' })
    }
  }

  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválida.' })
    }
    updates.role = role
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
  if (is_active !== undefined) updates.is_active = toBool(is_active)
  // Cargo é independente da permissão: trocar o role (acima) não mexe aqui.
  if (position !== undefined) updates.position = optionalText(position)
  if (birth_date !== undefined) updates.birth_date = birth_date || null
  if (admission_date !== undefined) updates.admission_date = admission_date || null
  if (termination_date !== undefined) updates.termination_date = termination_date || null
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

    invalidateUser(id)
    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em PUT /users/:id')
    return res.status(400).json({ error: err.message })
  }
})

// ─── DELETAR USUÁRIO (soft delete) ────────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  if (sameId(id, req.profile.id)) {
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

    invalidateUser(id)
    return res.status(204).send()
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em DELETE /users/:id')
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

    invalidateUser(id)
    return res.json(rows[0])
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em POST /users/:id/avatar')
    return res.status(400).json({ error: err.message })
  }
})

export default router
