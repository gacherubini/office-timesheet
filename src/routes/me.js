import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../lib/db.js'
import { comparePassword, hashPassword } from '../lib/password.js'
import { uploadFile, deleteFile, extractKeyFromUrl } from '../lib/storage.js'
import { canAccessMoney } from '../lib/permissions.js'
import { logger } from '../lib/logger.js'
import { DEFAULT_SIM_CONFIG, normalizeSimConfig } from '../lib/performanceSimulation.js'
import { dateInSaoPaulo, yearMonthInSaoPaulo } from '../lib/dates.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Apenas imagens são permitidas.'))
  },
})

const profileFields = 'id, name, email, role, is_active, position, birth_date, phone, avatar_url, monthly_income_goal, created_at'

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: req.authUser,
    profile: req.profile,
  })
})

router.get('/me/profile', requireAuth, async (req, res) => {
  const { rows, error } = await query(
    'SELECT id, name, email, role, is_active, position, birth_date, phone, avatar_url, monthly_income_goal, created_at FROM users WHERE id = $1',
    [req.profile.id]
  )

  if (error) return res.status(400).json({ error: error.message })
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado.' })
  return res.json(rows[0])
})

router.put('/me/profile', requireAuth, async (req, res) => {
  const { name, phone, birth_date, monthly_income_goal } = req.body

  const updates = {}
  const params = []
  let paramIdx = 1

  if (name !== undefined) {
    const trimmedName = name.trim()
    if (!trimmedName) return res.status(400).json({ error: 'Nome é obrigatório.' })
    updates.name = `$${paramIdx}`
    params.push(trimmedName)
    paramIdx++
  }
  if (phone !== undefined) {
    updates.phone = `$${paramIdx}`
    params.push(phone?.trim() || null)
    paramIdx++
  }
  if (birth_date !== undefined) {
    updates.birth_date = `$${paramIdx}`
    params.push(birth_date || null)
    paramIdx++
  }
  if (monthly_income_goal !== undefined) {
    const goal = Number(monthly_income_goal)
    if (!Number.isFinite(goal) || goal < 0) {
      return res.status(400).json({ error: 'Meta financeira deve ser maior ou igual a zero.' })
    }
    updates.monthly_income_goal = `$${paramIdx}`
    params.push(Number(goal.toFixed(2)))
    paramIdx++
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  const setClause = Object.entries(updates).map(([key, val]) => `${key} = ${val}`).join(', ')
  params.push(req.profile.id)

  const { rows, error } = await query(
    `UPDATE users SET ${setClause} WHERE id = $${paramIdx} RETURNING id, name, email, role, is_active, position, birth_date, phone, avatar_url, monthly_income_goal, created_at`,
    params
  )

  if (error) return res.status(400).json({ error: error.message })
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado.' })
  return res.json(rows[0])
})

router.post('/me/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' })
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' })
  }

  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.profile.id])
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    const ok = await comparePassword(current_password, rows[0].password_hash)
    if (!ok) {
      return res.status(401).json({ error: 'Senha atual incorreta.' })
    }

    const newHash = await hashPassword(new_password)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.profile.id])

    return res.json({ message: 'Senha alterada com sucesso.' })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/me/profile/avatar', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  }

  try {
    const { rows: profileRows } = await query(
      'SELECT id, avatar_url FROM users WHERE id = $1',
      [req.profile.id]
    )

    if (!profileRows || profileRows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado.' })
    }

    const profile = profileRows[0]
    if (profile.avatar_url) {
      const oldKey = extractKeyFromUrl(profile.avatar_url)
      if (oldKey) await deleteFile(oldKey)
    }

    const { url } = await uploadFile('avatars', req.file)

    const { rows, error } = await query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, name, email, role, is_active, position, birth_date, phone, avatar_url, monthly_income_goal, created_at',
      [url, req.profile.id]
    )

    if (error) return res.status(400).json({ error: error.message })
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado.' })
    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── HISTÓRICO DO COLABORADOR ─────────────────────────────────────────
router.get('/me/history', requireAuth, async (req, res) => {
  const userId = req.profile.id

  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))
  const offset = (page - 1) * limit

  try {
    const { rows: countRows } = await query(
      'SELECT COUNT(*) as total FROM time_entries WHERE user_id = $1',
      [userId]
    )
    const total = parseInt(countRows[0].total, 10)

    const { rows } = await query(
      `SELECT te.id, te.project_id, te.started_at, te.ended_at, te.duration_minutes, te.status,
              p.name as project_name, p.client as client_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.user_id = $1
       ORDER BY te.started_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    return res.json({
      data: rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_minutes: row.duration_minutes,
        status: row.status,
        projects: {
          name: row.project_name,
          client: row.client_name
        }
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── SOLICITAÇÕES DE ALTERAÇÃO DE PONTO (COLABORADOR) ────────────────
router.get('/me/time-entry-change-requests', requireAuth, async (req, res) => {
  const userId = req.profile.id
  const status = req.query.status

  try {
    let sql = `SELECT id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at
               FROM time_entry_change_requests
               WHERE user_id = $1`
    const params = [userId]

    if (status) {
      sql += ` AND status = $2`
      params.push(status)
    }

    sql += ` ORDER BY created_at DESC`

    const { rows } = await query(sql, params)
    return res.json(rows || [])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/me/time-entry-change-requests', requireAuth, async (req, res) => {
  const userId = req.profile.id
  const {
    time_entry_id,
    requested_project_id,
    requested_started_at,
    requested_ended_at,
    reason,
  } = req.body

  if (!time_entry_id || !requested_project_id || !requested_started_at || !requested_ended_at) {
    return res.status(400).json({
      error: 'Apontamento, projeto, início e saída solicitados são obrigatórios.',
    })
  }

  const trimmedReason = reason?.trim()
  if (!trimmedReason) {
    return res.status(400).json({ error: 'Informe o motivo da solicitação.' })
  }

  const requestedStart = new Date(requested_started_at)
  const requestedEnd = new Date(requested_ended_at)

  if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    return res.status(400).json({ error: 'Datas inválidas.' })
  }

  if (requestedEnd <= requestedStart) {
    return res.status(400).json({ error: 'A saída deve ser posterior ao início.' })
  }

  try {
    const { rows: entryRows } = await query(
      'SELECT id, user_id, status FROM time_entries WHERE id = $1 AND user_id = $2',
      [time_entry_id, userId]
    )

    if (!entryRows || entryRows.length === 0) {
      return res.status(404).json({ error: 'Apontamento não encontrado.' })
    }

    const entry = entryRows[0]
    if (entry.status !== 'completed') {
      return res.status(400).json({ error: 'Somente apontamentos finalizados podem ser alterados.' })
    }

    const { rows: projectRows } = await query(
      'SELECT id FROM projects WHERE id = $1',
      [requested_project_id]
    )

    if (!projectRows || projectRows.length === 0) {
      return res.status(404).json({ error: 'Projeto solicitado não encontrado.' })
    }

    const { rows, error } = await query(
      `INSERT INTO time_entry_change_requests (time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at`,
      [time_entry_id, userId, requested_project_id, requestedStart.toISOString(), requestedEnd.toISOString(), trimmedReason]
    )

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe uma solicitação pendente para este apontamento.' })
      }
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma solicitação pendente para este apontamento.' })
    }
    return res.status(400).json({ error: err.message })
  }
})

// ─── STATS DO COLABORADOR (KPIs do mês) ──────────────────────────────
router.get('/me/stats', requireAuth, async (req, res) => {
  if (!canAccessMoney(req.profile) && req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a dados financeiros.' })
  }

  const userId = req.profile.id

  let year, month
  if (req.query.month) {
    ;[year, month] = req.query.month.split('-').map(Number)
  } else {
    ;({ year, month } = yearMonthInSaoPaulo())
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const todayStr = dateInSaoPaulo()

  try {
    const { rows: entries } = await query(
      `SELECT te.id, te.duration_minutes, te.cost_snapshot, te.project_id, te.started_at,
              p.id as project_id_join, p.name, p.image_url
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.user_id = $1 AND te.status = 'completed'
         AND te.started_at >= ($2::timestamp AT TIME ZONE 'America/Sao_Paulo')
         AND te.started_at < (($3::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      [userId, startDate, endDate]
    )

    const { rows: profileRows } = await query(
      'SELECT hourly_rate, monthly_income_goal FROM users WHERE id = $1',
      [userId]
    )

    if (!profileRows || profileRows.length === 0) {
      return res.status(400).json({ error: 'Perfil não encontrado para cálculo da perspectiva.' })
    }

    const profile = profileRows[0]
    const total_minutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0)
    const total_cost = entries.reduce((sum, e) => sum + (e.cost_snapshot || 0), 0)
    const hourly_rate = Number(profile.hourly_rate) || 0
    const monthly_income_goal = Number(profile.monthly_income_goal) || 0

    const workingDaysSet = new Set(entries.map((e) => dateInSaoPaulo(new Date(e.started_at))))
    const working_days = workingDaysSet.size
    const dailyTotalsMap = {}

    for (const entry of entries) {
      const date = dateInSaoPaulo(new Date(entry.started_at))
      dailyTotalsMap[date] = (dailyTotalsMap[date] || 0) + (entry.duration_minutes || 0)
    }

    const avg_minutes_per_day = working_days > 0 ? Math.round(total_minutes / working_days) : 0
    const project_count = new Set(entries.map((e) => e.project_id)).size

    let business_days_in_month = 0
    for (let d = 1; d <= lastDay; d++) {
      const dow = new Date(year, month - 1, d).getDay()
      if (dow !== 0 && dow !== 6) business_days_in_month++
    }
    const goal_minutes = business_days_in_month * 8 * 60
    const goal_amount_pct =
      monthly_income_goal > 0 ? Math.min(100, Math.round((total_cost / monthly_income_goal) * 100)) : 0
    const remaining_goal_amount = Math.max(0, monthly_income_goal - total_cost)
    const required_goal_minutes =
      hourly_rate > 0 ? Math.ceil((monthly_income_goal / hourly_rate) * 60) : 0
    const remaining_goal_minutes =
      hourly_rate > 0 ? Math.ceil((remaining_goal_amount / hourly_rate) * 60) : 0
    const projected_monthly_income =
      working_days > 0
        ? Number(((total_cost / working_days) * business_days_in_month).toFixed(2))
        : 0

    const projectMap = {}
    for (const entry of entries) {
      const pid = entry.project_id
      if (!projectMap[pid]) {
        projectMap[pid] = {
          project_id: pid,
          project_name: entry.name || 'Sem projeto',
          project_image: entry.image_url || null,
          total_minutes: 0,
          today_minutes: 0,
        }
      }
      projectMap[pid].total_minutes += entry.duration_minutes || 0
      if (dateInSaoPaulo(new Date(entry.started_at)) === todayStr) {
        projectMap[pid].today_minutes += entry.duration_minutes || 0
      }
    }

    // "Tipos de tarefa mais feitas" (Performance): soma os cronômetros de tarefa
    // concluídos no mês, agrupados pela etapa (tasks.task_type).
    const { rows: taskTypeRows } = await query(
      `SELECT COALESCE(NULLIF(TRIM(t.task_type), ''), 'Sem etapa') AS task_type,
              COALESCE(SUM(ttl.duration_minutes), 0)::int AS total_minutes
       FROM task_time_logs ttl
       JOIN tasks t ON t.id = ttl.task_id
       WHERE ttl.user_id = $1 AND ttl.ended_at IS NOT NULL
         AND ttl.started_at >= ($2::timestamp AT TIME ZONE 'America/Sao_Paulo')
         AND ttl.started_at < (($3::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')
       GROUP BY 1
       HAVING COALESCE(SUM(ttl.duration_minutes), 0) > 0
       ORDER BY total_minutes DESC`,
      [userId, startDate, endDate]
    )

    return res.json({
      total_minutes,
      total_cost,
      hourly_rate,
      monthly_income_goal,
      goal_amount_pct,
      remaining_goal_amount,
      required_goal_minutes,
      remaining_goal_minutes,
      projected_monthly_income,
      working_days,
      avg_minutes_per_day,
      project_count,
      goal_minutes,
      business_days_in_month,
      year,
      month,
      daily_totals: Object.entries(dailyTotalsMap).map(([date, minutes]) => ({
        date,
        minutes,
      })),
      project_breakdown: Object.values(projectMap),
      task_type_breakdown: taskTypeRows,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

const YM_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Simulador de performance: config por mês (jsonb). O usuário informa a META de
// ganho e, opcionalmente, horas de fim de semana; o cliente distribui as horas
// pelos dias úteis que faltam. Horas reais nunca entram aqui — vêm de time_entries.
// O shape e a normalização vivem em lib/performanceSimulation.js: a tool
// simulacao_performance do agente lê a mesma config e precisa da mesma leitura.

router.get('/me/simulation', requireAuth, async (req, res) => {
  const month = String(req.query.month || '')
  if (!YM_RE.test(month)) {
    return res.status(400).json({ error: 'Parâmetro "month" inválido. Use o formato YYYY-MM.' })
  }
  const { rows } = await query(
    'SELECT planned FROM performance_simulations WHERE user_id = $1 AND ym = $2',
    [req.profile.id, month]
  )
  const config = rows[0] ? normalizeSimConfig(rows[0].planned) : { ...DEFAULT_SIM_CONFIG }
  return res.json({ month, config })
})

router.put('/me/simulation', requireAuth, async (req, res) => {
  const { month, config } = req.body || {}
  if (!YM_RE.test(String(month || ''))) {
    return res.status(400).json({ error: 'Campo "month" inválido. Use o formato YYYY-MM.' })
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return res.status(400).json({ error: 'Campo "config" deve ser um objeto.' })
  }
  if (
    typeof config.target_amount !== 'number' ||
    !Number.isFinite(config.target_amount) ||
    config.target_amount < 0
  ) {
    return res.status(400).json({ error: 'Campo "target_amount" deve ser um número >= 0.' })
  }
  if (typeof config.include_weekends !== 'boolean') {
    return res.status(400).json({ error: 'Campo "include_weekends" deve ser booleano.' })
  }
  if (
    !Number.isInteger(config.weekend_default_minutes) ||
    config.weekend_default_minutes < 0 ||
    config.weekend_default_minutes > 1440
  ) {
    return res
      .status(400)
      .json({ error: 'Campo "weekend_default_minutes" deve ser um inteiro de 0 a 1440.' })
  }
  const overridesIn = config.overrides
  if (overridesIn === null || typeof overridesIn !== 'object' || Array.isArray(overridesIn)) {
    return res.status(400).json({ error: 'Campo "overrides" deve ser um objeto de datas.' })
  }
  const overrides = {}
  for (const [date, minutes] of Object.entries(overridesIn)) {
    if (!DATE_RE.test(date) || date.slice(0, 7) !== month) {
      return res.status(400).json({ error: `Data fora do mês ${month}: ${date}.` })
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      return res.status(400).json({ error: `Minutos inválidos para ${date}: use um inteiro de 0 a 1440.` })
    }
    overrides[date] = minutes
  }
  const clean = {
    target_amount: config.target_amount,
    include_weekends: config.include_weekends,
    weekend_default_minutes: config.weekend_default_minutes,
    overrides,
  }
  await query(
    `INSERT INTO performance_simulations (user_id, ym, planned)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, ym) DO UPDATE SET planned = EXCLUDED.planned, updated_at = now()`,
    [req.profile.id, month, JSON.stringify(clean)]
  )
  return res.json({ month, config: clean })
})

// Histórico de performance dos últimos N meses (horas + valor por mês).
// Alimenta a faixa "Histórico — últimos meses" da página Performance.
// Mesma guarda financeira do /me/stats.
router.get('/me/monthly-history', requireAuth, async (req, res) => {
  if (!canAccessMoney(req.profile) && req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a dados financeiros.' })
  }

  const userId = req.profile.id
  const months = Math.min(24, Math.max(1, Number(req.query.months) || 6))

  const { year: anchorYear, month: anchorMonth } = yearMonthInSaoPaulo()
  // Primeiro dia do mês inicial da janela (N-1 meses atrás).
  const windowStart = new Date(anchorYear, anchorMonth - 1 - (months - 1), 1)
  const startDate = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}-01`

  try {
    const { rows } = await query(
      `SELECT to_char(date_trunc('month', te.started_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS ym,
              SUM(te.duration_minutes) AS minutes,
              SUM(te.cost_snapshot) AS cost
       FROM time_entries te
       WHERE te.user_id = $1 AND te.status = 'completed'
         AND te.started_at >= ($2::timestamp AT TIME ZONE 'America/Sao_Paulo')
       GROUP BY 1`,
      [userId, startDate]
    )

    const map = new Map(
      rows.map((r) => [r.ym, { minutes: Number(r.minutes) || 0, cost: Number(r.cost) || 0 }])
    )

    // Preenche todos os N meses (com zeros onde não houve apontamento), do mais antigo ao atual.
    const history = []
    for (let i = 0; i < months; i++) {
      const d = new Date(anchorYear, anchorMonth - 1 - (months - 1) + i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const ym = `${y}-${String(m).padStart(2, '0')}`
      const found = map.get(ym) || { minutes: 0, cost: 0 }
      history.push({ year: y, month: m, ym, total_minutes: found.minutes, total_cost: found.cost })
    }

    return res.json({ history })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// Ganhos por projeto do usuário logado (histórico). Agrega apontamentos
// concluídos por projeto, com filtro opcional de período (from/to). Ganho =
// soma de cost_snapshot (valor real registrado em cada apontamento).
router.get('/me/project-earnings', requireAuth, async (req, res) => {
  // Estagiário administrativo é salário fixo (sem ganho por hora/projeto).
  if (!canAccessMoney(req.profile) && req.profile?.role === 'administrative_intern') {
    return res.status(403).json({ error: 'Acesso restrito a dados financeiros.' })
  }

  const conditions = ['te.user_id = $1', "te.status = 'completed'"]
  const params = [req.profile.id]
  if (req.query.from) {
    params.push(req.query.from)
    conditions.push(`te.started_at >= ($${params.length}::timestamp AT TIME ZONE 'America/Sao_Paulo')`)
  }
  if (req.query.to) {
    params.push(req.query.to)
    conditions.push(`te.started_at < (($${params.length}::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`)
  }

  try {
    const { rows } = await query(
      `SELECT p.id AS project_id, p.name AS project_name, p.image_url AS project_image,
              COALESCE(SUM(te.duration_minutes), 0)::int AS total_minutes,
              COALESCE(SUM(te.cost_snapshot), 0) AS total_cost,
              COUNT(*)::int AS entry_count
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY p.id, p.name, p.image_url
       ORDER BY total_cost DESC, total_minutes DESC`,
      params,
    )
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /me/project-earnings')
    return res.status(400).json({ error: err.message })
  }
})

// Apontamento de horas aberto do usuário logado (1 por vez). Inclui info de
// pausa para o cronômetro nos cards do catálogo mostrar o estado certo.
router.get('/me/active-timer', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT te.id, te.project_id, te.started_at,
              COALESCE(
                SUM(EXTRACT(EPOCH FROM (ep.resumed_at - ep.paused_at)))
                  FILTER (WHERE ep.resumed_at IS NOT NULL), 0
              )::int AS total_paused_seconds,
              COALESCE(BOOL_OR(ep.resumed_at IS NULL), false) AS paused,
              MAX(ep.paused_at) FILTER (WHERE ep.resumed_at IS NULL) AS paused_at
       FROM time_entries te
       LEFT JOIN time_entry_pauses ep ON ep.time_entry_id = te.id
       WHERE te.user_id = $1 AND te.status = 'running'
       GROUP BY te.id, te.project_id, te.started_at
       LIMIT 1`,
      [req.profile.id],
    )
    return res.json(rows[0] || null)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /me/active-timer')
    return res.status(400).json({ error: err.message })
  }
})

// Status de ponto do usuário: se tem apontamento rodando e se já bateu ponto
// hoje (data do servidor, fuso America/Sao_Paulo). Usado pelo lembrete de ponto.
router.get('/me/time-clock-status', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         EXISTS(
           SELECT 1 FROM time_entries
           WHERE user_id = $1 AND status = 'running'
         ) AS active,
         EXISTS(
           SELECT 1 FROM time_entries
           WHERE user_id = $1
             AND (started_at AT TIME ZONE 'America/Sao_Paulo')::date
                 = (now() AT TIME ZONE 'America/Sao_Paulo')::date
         ) AS clocked_in_today,
         EXISTS(
           SELECT 1 FROM time_entries WHERE user_id = $1
         ) AS has_any_entry`,
      [req.profile.id],
    )
    return res.json(rows[0] || { active: false, clocked_in_today: false, has_any_entry: false })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /me/time-clock-status')
    return res.status(400).json({ error: err.message })
  }
})

// ─── ANIVERSARIANTES (compartilhado: admin e employee) ────────────────
router.get('/birthdays', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, birth_date, avatar_url, phone, position
       FROM users
       WHERE deleted_at IS NULL AND is_active = true AND birth_date IS NOT NULL
       ORDER BY birth_date`
    )
    return res.json(rows || [])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
