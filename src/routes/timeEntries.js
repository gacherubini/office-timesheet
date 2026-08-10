import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireApprover } from '../middleware/requireApprover.js'
import { requireOperationalAccess } from '../middleware/requireOperationalAccess.js'
import { canAccessMoney } from '../lib/permissions.js'
import { query, withTransaction } from '../lib/db.js'
import { notifyAdmins } from '../lib/notificationsHub.js'
import { calculateDurationMinutes, calculateCostSnapshot } from '../lib/timeMath.js'

const router = Router()

async function getApprovedVacationForToday(userId) {
  // "Hoje" no fuso do estúdio — no Fly o processo é UTC e todayValue() JS
  // liberaria timer entre 21h–00h BRT no primeiro dia de férias.
  const { rows } = await query(
    `SELECT id, start_date, end_date FROM vacation_requests
     WHERE user_id = $1 AND status = 'approved'
       AND start_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND end_date   >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
     LIMIT 1`,
    [userId]
  )

  return rows.length > 0 ? rows[0] : null
}

async function blockTimerDuringVacation(req, res, next) {
  try {
    const vacation = await getApprovedVacationForToday(req.profile.id)

    if (vacation) {
      return res.status(403).json({
        error: 'Timer bloqueado durante férias aprovadas.',
        vacation,
      })
    }

    return next()
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
}

async function enrichChangeRequests(requests) {
  const rows = requests || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((request) => request.user_id).filter(Boolean))]
  const entryIds = [...new Set(rows.map((request) => request.time_entry_id).filter(Boolean))]
  const requestedProjectIds = [...new Set(rows.map((request) => request.requested_project_id).filter(Boolean))]

  try {
    const [
      profilesResult,
      entriesResult,
      projectsResult,
    ] = await Promise.all([
      userIds.length
        ? query('SELECT id, name, email, position, avatar_url FROM users WHERE id = ANY($1)', [userIds])
        : Promise.resolve({ rows: [] }),
      entryIds.length
        ? query(
          `SELECT te.id, te.user_id, te.project_id, te.started_at, te.ended_at, te.duration_minutes, te.cost_snapshot, te.status,
                  p.name as project_name, p.client as client_name
           FROM time_entries te
           LEFT JOIN projects p ON p.id = te.project_id
           WHERE te.id = ANY($1)`,
          [entryIds]
        )
        : Promise.resolve({ rows: [] }),
      requestedProjectIds.length
        ? query('SELECT id, name FROM projects WHERE id = ANY($1)', [requestedProjectIds])
        : Promise.resolve({ rows: [] }),
    ])

    const profiles = profilesResult.rows || []
    const entries = entriesResult.rows || []
    const requestedProjects = projectsResult.rows || []

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]))
    const requestedProjectMap = new Map(requestedProjects.map((project) => [project.id, project]))

    return rows.map((request) => {
      const entry = entryMap.get(request.time_entry_id) || null
      return {
        ...request,
        profile: profileMap.get(request.user_id) || null,
        time_entry: entry
          ? { ...entry, project: { name: entry.project_name, client: entry.client_name } }
          : null,
        requested_project: requestedProjectMap.get(request.requested_project_id) || null,
      }
    })
  } catch (err) {
    throw err
  }
}

// ─── START ────────────────────────────────────────────────────────────
router.post('/time-entries/start', requireAuth, blockTimerDuringVacation, async (req, res) => {
  const { project_id } = req.body

  if (!project_id) {
    return res.status(400).json({ error: 'project_id é obrigatório.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now(), 'running') RETURNING *`,
      [req.profile.id, project_id]
    )

    await notifyAdmins({
      type: 'time_entry_started',
      projectId: project_id,
      actorId: req.profile.id,
    })

    return res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um apontamento aberto.' })
    }
    return res.status(400).json({ error: err.message })
  }
})

// ─── PAUSE ────────────────────────────────────────────────────────────
router.post('/time-entries/pause', requireAuth, async (req, res) => {
  try {
    const { rows: openEntries } = await query(
      `SELECT id, started_at FROM time_entries
       WHERE user_id = $1 AND status = 'running'
       LIMIT 1`,
      [req.profile.id]
    )

    if (!openEntries || openEntries.length === 0) {
      return res.status(404).json({ error: 'Nenhum apontamento aberto.' })
    }

    const entryId = openEntries[0].id

    // Impede duplo-pause: uma pausa aberta sobreposta a outra faria o stop
    // descontar tempo a mais (risco de subpagamento).
    const { rows: openPauses } = await query(
      `SELECT id FROM time_entry_pauses
       WHERE time_entry_id = $1 AND resumed_at IS NULL
       LIMIT 1`,
      [entryId]
    )
    if (openPauses.length > 0) {
      return res.status(409).json({ error: 'O apontamento já está pausado.' })
    }

    const { rows } = await query(
      `INSERT INTO time_entry_pauses (time_entry_id, paused_at)
       VALUES ($1, now()) RETURNING id, time_entry_id, paused_at, resumed_at`,
      [entryId]
    )

    return res.json(rows[0])
  } catch (err) {
    // Backstop do índice único parcial (one_open_pause_per_entry).
    if (err.code === '23505') {
      return res.status(409).json({ error: 'O apontamento já está pausado.' })
    }
    return res.status(400).json({ error: err.message })
  }
})

// ─── RESUME ───────────────────────────────────────────────────────────
router.post('/time-entries/resume', requireAuth, blockTimerDuringVacation, async (req, res) => {
  try {
    const { rows: openPauses } = await query(
      `SELECT ep.id, ep.time_entry_id FROM time_entry_pauses ep
       JOIN time_entries te ON te.id = ep.time_entry_id
       WHERE te.user_id = $1 AND te.status = 'running' AND ep.resumed_at IS NULL
       ORDER BY ep.paused_at DESC
       LIMIT 1`,
      [req.profile.id]
    )

    if (!openPauses || openPauses.length === 0) {
      return res.status(404).json({ error: 'Nenhuma pausa ativa para retomar.' })
    }

    const pauseId = openPauses[0].id

    const { rows } = await query(
      `UPDATE time_entry_pauses SET resumed_at = now() WHERE id = $1 RETURNING id, time_entry_id, paused_at, resumed_at`,
      [pauseId]
    )

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── STOP ─────────────────────────────────────────────────────────────
router.post('/time-entries/stop', requireAuth, async (req, res) => {
  try {
    const { rows: openEntries } = await query(
      `SELECT id, started_at, project_id FROM time_entries
       WHERE user_id = $1 AND status = 'running'
       LIMIT 1`,
      [req.profile.id]
    )

    if (!openEntries || openEntries.length === 0) {
      return res.status(404).json({ error: 'Nenhum apontamento aberto.' })
    }

    const entry = openEntries[0]
    const startDate = new Date(entry.started_at)
    const now = new Date()

    // Calcula duração líquida descontando pausas
    const { rows: pausesData } = await query(
      `SELECT paused_at, resumed_at FROM time_entry_pauses
       WHERE time_entry_id = $1
       ORDER BY paused_at`,
      [entry.id]
    )

    let totalPausedMs = 0
    for (const pause of pausesData) {
      const pausedTime = new Date(pause.paused_at)
      const resumedTime = pause.resumed_at ? new Date(pause.resumed_at) : now
      totalPausedMs += Math.max(0, resumedTime.getTime() - pausedTime.getTime())
    }

    const durationMs = now.getTime() - startDate.getTime() - totalPausedMs
    const durationMinutes = calculateDurationMinutes(new Date(0), new Date(durationMs))

    const { rows: userRates } = await query(
      `SELECT hourly_rate FROM users WHERE id = $1`,
      [req.profile.id]
    )

    const userRate = userRates?.[0]?.hourly_rate
    const rate = userRate || 0
    const costSnapshot = calculateCostSnapshot(durationMinutes, rate)

    // Atualiza entry
    const { rows } = await query(
      `UPDATE time_entries
       SET status = 'completed', ended_at = now(), duration_minutes = $1, cost_snapshot = $2
       WHERE id = $3 RETURNING *`,
      [durationMinutes, costSnapshot, entry.id]
    )

    await notifyAdmins({
      type: 'time_entry_stopped',
      projectId: entry.project_id,
      actorId: req.profile.id,
    })

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── CHANGE REQUESTS ──────────────────────────────────────────────────
router.get('/admin/time-entry-change-requests', requireAuth, requireApprover, async (req, res) => {
  try {
    const status = req.query.status
    let sql = `SELECT id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at
               FROM time_entry_change_requests`
    const params = []
    if (status) {
      sql += ` WHERE status = $1`
      params.push(status)
    }
    sql += ` ORDER BY created_at DESC`

    const { rows } = await query(sql, params)
    const enriched = await enrichChangeRequests(rows)
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/time-entry-change-requests/:id/approve', requireAuth, requireApprover, async (req, res) => {
  const { id } = req.params
  const { admin_note } = req.body

  try {
    const { rows: requestRows } = await query(
      `SELECT id, time_entry_id, requested_project_id, requested_started_at, requested_ended_at, user_id
       FROM time_entry_change_requests WHERE id = $1`,
      [id]
    )

    if (!requestRows || requestRows.length === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' })
    }

    const changeRequest = requestRows[0]
    const { time_entry_id, requested_project_id, requested_started_at, requested_ended_at, user_id } = changeRequest

    // Valida se a entry pertence ao usuário
    const { rows: entryRows } = await query(
      `SELECT id FROM time_entries WHERE id = $1 AND user_id = $2`,
      [time_entry_id, user_id]
    )

    if (!entryRows || entryRows.length === 0) {
      return res.status(404).json({ error: 'Apontamento não encontrado.' })
    }

    // Atualiza com transaction
    await withTransaction(async (client) => {
      const { rows: userRates } = await client.query(
        'SELECT hourly_rate FROM users WHERE id = $1',
        [user_id]
      )

      const userRate = userRates?.[0]?.hourly_rate
      const rate = userRate || 0

      const startDate = new Date(requested_started_at)
      const endDate = new Date(requested_ended_at)
      const durationMinutes = calculateDurationMinutes(startDate, endDate)
      const costSnapshot = calculateCostSnapshot(durationMinutes, rate)

      await client.query(
        `UPDATE time_entries
         SET project_id = $1, started_at = $2, ended_at = $3, duration_minutes = $4, cost_snapshot = $5,
             status = 'completed', edited_by = $6, edited_at = now()
         WHERE id = $7`,
        [requested_project_id, requested_started_at, requested_ended_at, durationMinutes, costSnapshot, req.profile.id, time_entry_id]
      )

      await client.query(
        `UPDATE time_entry_change_requests
         SET status = 'approved', decided_by = $1, decided_at = now(), admin_note = $2
         WHERE id = $3`,
        [req.profile.id, admin_note || null, id]
      )
    })

    const { rows: approvedRequest } = await query(
      `SELECT id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at
       FROM time_entry_change_requests WHERE id = $1`,
      [id]
    )

    const enriched = await enrichChangeRequests(approvedRequest)
    return res.json(enriched[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/time-entry-change-requests/:id/reject', requireAuth, requireApprover, async (req, res) => {
  const { id } = req.params
  const { admin_note } = req.body

  try {
    const { rows } = await query(
      `UPDATE time_entry_change_requests
       SET status = 'rejected', decided_by = $1, decided_at = now(), admin_note = $2
       WHERE id = $3
       RETURNING id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_at, created_at, updated_at`,
      [req.profile.id, admin_note || null, id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' })
    }

    const enriched = await enrichChangeRequests(rows)
    return res.json(enriched[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── CREATE (ADMIN) ────────────────────────────────────────────────────
router.post('/admin/time-entries', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, project_id, started_at, ended_at } = req.body

  if (!user_id || !project_id || !started_at || !ended_at) {
    return res.status(400).json({
      error: 'user_id, project_id, started_at e ended_at são obrigatórios.',
    })
  }

  try {
    const startDate = new Date(started_at)
    const endDate = new Date(ended_at)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Datas inválidas.' })
    }

    if (endDate <= startDate) {
      return res.status(400).json({ error: 'A saída deve ser posterior ao início.' })
    }

    const durationMinutes = calculateDurationMinutes(startDate, endDate)

    const { rows: userRates } = await query(
      'SELECT hourly_rate FROM users WHERE id = $1',
      [user_id]
    )

    const userRate = userRates?.[0]?.hourly_rate
    const rate = userRate || 0
    const costSnapshot = calculateCostSnapshot(durationMinutes, rate)

    const { rows } = await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot, status, created_by_admin)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', true)
       RETURNING *`,
      [user_id, project_id, started_at, ended_at, durationMinutes, costSnapshot]
    )

    return res.status(201).json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── UPDATE (ADMIN) ────────────────────────────────────────────────────
router.put('/admin/time-entries/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { project_id, started_at, ended_at } = req.body

  try {
    const { rows: entryRows } = await query(
      'SELECT id FROM time_entries WHERE id = $1',
      [id]
    )

    if (!entryRows || entryRows.length === 0) {
      return res.status(404).json({ error: 'Apontamento não encontrado.' })
    }

    const updates = {}
    let paramIdx = 1
    const params = []

    if (project_id !== undefined) {
      updates.project_id = `$${paramIdx}`
      params.push(project_id)
      paramIdx++
    }

    if (started_at !== undefined) {
      const startDate = new Date(started_at)
      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Data de início inválida.' })
      }
      updates.started_at = `$${paramIdx}`
      params.push(started_at)
      paramIdx++
    }

    if (ended_at !== undefined) {
      const endDate = new Date(ended_at)
      if (Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Data de término inválida.' })
      }
      updates.ended_at = `$${paramIdx}`
      params.push(ended_at)
      paramIdx++
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
    }

    // Se atualizou datas, recalcula duração e custo
    let shouldRecalculate = false
    if (updates.started_at || updates.ended_at) {
      shouldRecalculate = true
      const { rows: currentEntry } = await query(
        'SELECT user_id, project_id, started_at, ended_at FROM time_entries WHERE id = $1',
        [id]
      )

      const start = updates.started_at ? new Date(params[Object.keys(updates).indexOf('started_at')]) : new Date(currentEntry[0].started_at)
      const end = updates.ended_at ? new Date(params[Object.keys(updates).indexOf('ended_at')]) : new Date(currentEntry[0].ended_at)

      if (end <= start) {
        return res.status(400).json({ error: 'A saída deve ser posterior ao início.' })
      }

      const durationMinutes = calculateDurationMinutes(start, end)
      const userId = currentEntry[0].user_id

      const { rows: userRates } = await query(
        'SELECT hourly_rate FROM users WHERE id = $1',
        [userId]
      )

      const userRate = userRates?.[0]?.hourly_rate
      const rate = userRate || 0
      const costSnapshot = calculateCostSnapshot(durationMinutes, rate)

      updates.duration_minutes = `$${paramIdx}`
      params.push(durationMinutes)
      paramIdx++

      updates.cost_snapshot = `$${paramIdx}`
      params.push(costSnapshot)
      paramIdx++
    }

    const setClause = Object.entries(updates).map(([key, val]) => `${key} = ${val}`).join(', ')
    params.push(id)

    const { rows } = await query(
      `UPDATE time_entries SET ${setClause} WHERE id = $${paramIdx} RETURNING *`,
      params
    )

    return res.json(rows[0])
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── DELETE (ADMIN) ────────────────────────────────────────────────────
router.delete('/admin/time-entries/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  try {
    const { rows } = await query(
      'DELETE FROM time_entries WHERE id = $1 RETURNING id',
      [id]
    )

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Apontamento não encontrado.' })
    }

    return res.json({ message: 'Apontamento deletado com sucesso.' })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── LIVE (status de toda a equipe) ────────────────────────────────────
router.get('/admin/live', requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.position, u.avatar_url,
              te.id as entry_id, te.project_id, te.started_at, te.duration_minutes,
              te.status as entry_status,
              p.name as project_name,
              pauses.break_minutes, pauses.break_count, pauses.paused_since,
              curtask.task_id, curtask.task_title, curtask.task_started_at
       FROM users u
       LEFT JOIN time_entries te
         ON te.user_id = u.id AND te.status IN ('running', 'paused')
       LEFT JOIN projects p ON p.id = te.project_id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ep.resumed_at, now()) - ep.paused_at)) / 60), 0)::int AS break_minutes,
           COUNT(*)::int AS break_count,
           MAX(ep.paused_at) FILTER (WHERE ep.resumed_at IS NULL) AS paused_since
         FROM time_entry_pauses ep
         WHERE ep.time_entry_id = te.id
       ) pauses ON te.id IS NOT NULL
       LEFT JOIN LATERAL (
         -- Tarefa do kanban com cronômetro aberto. Prioriza a do projeto do
         -- ponto ativo; senão, a sessão aberta mais recente do usuário.
         SELECT tt.task_id, tk.title AS task_title, tt.started_at AS task_started_at
         FROM task_time_logs tt
         JOIN tasks tk ON tk.id = tt.task_id
         WHERE tt.user_id = u.id AND tt.ended_at IS NULL
         ORDER BY (tk.project_id = te.project_id) DESC NULLS LAST, tt.started_at DESC
         LIMIT 1
       ) curtask ON true
       WHERE u.deleted_at IS NULL AND u.is_active = true
       ORDER BY u.name`
    )

    return res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        avatar_url: row.avatar_url,
        status: row.entry_status || 'offline',
        project: row.project_name || null,
        started_at: row.started_at,
        duration_minutes: row.duration_minutes,
        break_minutes: row.entry_id ? (row.break_minutes || 0) : 0,
        break_count: row.entry_id ? (row.break_count || 0) : 0,
        paused_since: row.paused_since || null,
        task: row.task_title || null,
        task_id: row.task_id || null,
        task_started_at: row.task_started_at || null,
      }))
    )
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── LIST (ADMIN) ─────────────────────────────────────────────────────
router.get('/admin/time-entries', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const offset = (page - 1) * limit

    // WHERE clause comum (count + list + summary)
    const conditions = []
    const baseParams = []
    if (req.query.user_id) {
      baseParams.push(req.query.user_id)
      conditions.push(`te.user_id = $${baseParams.length}`)
    }
    if (req.query.project_id) {
      baseParams.push(req.query.project_id)
      conditions.push(`te.project_id = $${baseParams.length}`)
    }
    if (req.query.status) {
      baseParams.push(req.query.status)
      conditions.push(`te.status = $${baseParams.length}`)
    }
    if (req.query.start_date) {
      baseParams.push(req.query.start_date)
      conditions.push(`te.started_at >= ($${baseParams.length}::timestamp AT TIME ZONE 'America/Sao_Paulo')`)
    }
    if (req.query.end_date) {
      baseParams.push(req.query.end_date)
      conditions.push(`te.started_at < (($${baseParams.length}::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`)
    }
    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

    // Count
    const { rows: countRows } = await query(
      `SELECT COUNT(*) as total FROM time_entries te${whereClause}`,
      baseParams
    )
    const total = parseInt(countRows[0].total, 10)

    // List
    const listParams = [...baseParams, limit, offset]
    const { rows } = await query(
      `SELECT te.id, te.user_id, te.project_id, te.started_at, te.ended_at, te.duration_minutes, te.cost_snapshot, te.status, te.created_by_admin,
              u.name as user_name, u.position as user_position, u.avatar_url as user_avatar_url,
              p.name as project_name, p.client as project_client
       FROM time_entries te
       LEFT JOIN users u ON u.id = te.user_id
       LEFT JOIN projects p ON p.id = te.project_id
       ${whereClause}
       ORDER BY te.started_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    )

    // Summary agregado
    const { rows: aggRows } = await query(
      `SELECT
         COALESCE(SUM(te.duration_minutes), 0)::int as total_minutes,
         COALESCE(SUM(te.cost_snapshot), 0)::numeric as total_cost,
         COUNT(DISTINCT (te.started_at AT TIME ZONE 'America/Sao_Paulo')::date)::int as working_days
       FROM time_entries te
       ${whereClause}`,
      baseParams
    )
    const totalMinutes = aggRows[0]?.total_minutes || 0
    const workingDays = aggRows[0]?.working_days || 0
    const totalCost = Number(aggRows[0]?.total_cost || 0)

    // Daily totals
    const { rows: dailyRows } = await query(
      `SELECT te.user_id, (te.started_at AT TIME ZONE 'America/Sao_Paulo')::date as date,
              COALESCE(SUM(te.duration_minutes), 0)::int as minutes
       FROM time_entries te
       ${whereClause}
       GROUP BY te.user_id, (te.started_at AT TIME ZONE 'America/Sao_Paulo')::date`,
      baseParams
    )

    // Reembolsos e bônus do período (só se start_date e end_date informados)
    let reimbursements = 0
    let bonusesTotal = 0
    if (req.query.start_date && req.query.end_date) {
      const dateRangeParams = [req.query.start_date, req.query.end_date]
      let userFilter = ''
      if (req.query.user_id) {
        dateRangeParams.push(req.query.user_id)
        userFilter = ` AND user_id = $3`
      }
      const { rows: expRows } = await query(
        `SELECT COALESCE(SUM(amount), 0)::numeric as total
         FROM expense_requests
         WHERE status = 'approved' AND expense_date >= $1::date AND expense_date <= $2::date${userFilter}`,
        dateRangeParams
      )
      reimbursements = Number(expRows[0]?.total || 0)

      const { rows: bonRows } = await query(
        `SELECT COALESCE(SUM(amount), 0)::numeric as total
         FROM bonuses
         WHERE bonus_date >= $1::date AND bonus_date <= $2::date${userFilter}`,
        dateRangeParams
      )
      bonusesTotal = Number(bonRows[0]?.total || 0)
    }

    return res.json({
      data: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        project_id: row.project_id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_minutes: row.duration_minutes,
        cost_snapshot: row.cost_snapshot,
        status: row.status,
        created_by_admin: row.created_by_admin,
        profile: { name: row.user_name, position: row.user_position, avatar_url: row.user_avatar_url },
        project: { name: row.project_name, client: row.project_client },
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        total_cost: totalCost,
        total_minutes: totalMinutes,
        working_days: workingDays,
        average_minutes_per_day: workingDays > 0 ? Math.round(totalMinutes / workingDays) : 0,
        reimbursements,
        bonuses: bonusesTotal,
        net_total: totalCost + reimbursements + bonusesTotal,
        daily_totals: dailyRows.map((r) => ({
          user_id: r.user_id,
          date: r.date,
          minutes: r.minutes,
        })),
      },
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
