import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { query } from '../lib/db.js'
import { dateInSaoPaulo } from '../lib/dates.js'

const router = Router()

// Filtro half-open no fuso do estúdio.
// Usar ::timestamp (não ::date): em Postgres, `date AT TIME ZONE tz` NÃO produz
// meia-noite em tz — vira timestamp no TZ da sessão e inclui a madrugada UTC
// do dia seguinte (noite BRT do dia pedido).
const TE_RANGE_SQL = `started_at >= ($1::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND started_at < (($2::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function hoursFromMinutes(minutes) {
  return Number(((Number(minutes) || 0) / 60).toFixed(2))
}

function dayInSaoPaulo(value) {
  if (!value) return null
  // DATE do Postgres já chega como YYYY-MM-DD (type parser em db.js).
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return dateInSaoPaulo(new Date(value))
}

function addMovementDate(set, value) {
  const day = dayInSaoPaulo(value)
  if (day) set.add(day)
}

function buildDailyHours(entries = [], profileMap = new Map(), projectMap = new Map()) {
  const dailyMap = new Map()

  for (const entry of entries || []) {
    const day = entry.local_day
      ? dayInSaoPaulo(entry.local_day)
      : (entry.started_at ? dayInSaoPaulo(entry.started_at) : null)
    if (!day) continue

    const profile = profileMap.get(entry.user_id)
    const key = `${entry.user_id}:${day}`

    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        id: key,
        date: day,
        user_id: entry.user_id,
        profile: profile
          ? { id: profile.id, name: profile.name, email: profile.email, position: profile.position }
          : { id: entry.user_id, name: 'Desconhecido', email: null, position: null },
        total_minutes: 0,
        total_cost: 0,
        entries_count: 0,
        projects: new Map(),
      })
    }

    const daily = dailyMap.get(key)
    const minutes = Number(entry.duration_minutes) || 0
    const cost = Number(entry.cost_snapshot) || 0
    daily.total_minutes += minutes
    daily.total_cost += cost
    daily.entries_count += 1

    const project = projectMap.get(entry.project_id)
    const projectId = entry.project_id || 'sem-projeto'
    if (!daily.projects.has(projectId)) {
      daily.projects.set(projectId, {
        id: projectId,
        name: project?.name || 'Sem projeto',
        client: project?.client || null,
        minutes: 0,
        cost: 0,
      })
    }

    const dailyProject = daily.projects.get(projectId)
    dailyProject.minutes += minutes
    dailyProject.cost += cost
  }

  return Array.from(dailyMap.values())
    .map((daily) => ({
      ...daily,
      total_hours: hoursFromMinutes(daily.total_minutes),
      total_cost: roundMoney(daily.total_cost),
      projects_count: daily.projects.size,
      projects: Array.from(daily.projects.values())
        .map((project) => ({
          ...project,
          hours: hoursFromMinutes(project.minutes),
          cost: roundMoney(project.cost),
        }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => (
      b.date.localeCompare(a.date) ||
      String(a.profile?.name || '').localeCompare(String(b.profile?.name || ''))
    ))
}

router.get('/reports/financial', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  try {
    const [
      { rows: entries },
      { rows: expenses },
      { rows: bonuses },
      { rows: profiles },
      { rows: projects },
    ] = await Promise.all([
      query(
        `SELECT id, user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot, status,
                (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS local_day
         FROM time_entries
         WHERE status = 'completed'
           AND ${TE_RANGE_SQL}`,
        [start_date, end_date]
      ),
      query(
        `SELECT id, user_id, title, description, amount, expense_date, receipt_url, status, created_at
         FROM expense_requests
         WHERE expense_date >= $1::date AND expense_date <= $2::date
         ORDER BY expense_date DESC`,
        [start_date, end_date]
      ),
      query(
        `SELECT id, user_id, title, description, amount, bonus_date, created_at
         FROM bonuses
         WHERE bonus_date >= $1::date AND bonus_date <= $2::date
         ORDER BY bonus_date DESC`,
        [start_date, end_date]
      ),
      query(
        `SELECT id, name, email, position, hourly_rate FROM users`
      ),
      query(
        `SELECT id, name, client, status FROM projects`
      ),
    ])

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    const userMap = new Map()
    const projectCostMap = new Map()
    const movementDates = new Set()
    const alerts = []

    function ensureUser(userId) {
      const profile = profileMap.get(userId)
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          id: userId,
          name: profile?.name || 'Desconhecido',
          email: profile?.email || null,
          position: profile?.position || null,
          hourly_rate: Number(profile?.hourly_rate) || 0,
          total_minutes: 0,
          hours_cost: 0,
          approved_expenses: 0,
          pending_expenses: 0,
          rejected_expenses: 0,
          bonuses: 0,
          entries_count: 0,
          working_days: new Set(),
          projects: new Set(),
        })
      }
      return userMap.get(userId)
    }

    for (const entry of entries || []) {
      const user = ensureUser(entry.user_id)
      const minutes = Number(entry.duration_minutes) || 0
      const cost = Number(entry.cost_snapshot) || 0
      const day = entry.local_day
        ? dayInSaoPaulo(entry.local_day)
        : (entry.started_at ? dayInSaoPaulo(entry.started_at) : null)

      user.total_minutes += minutes
      user.hours_cost += cost
      user.entries_count += 1
      if (day) user.working_days.add(day)
      if (entry.project_id) user.projects.add(entry.project_id)
      if (day) movementDates.add(day)

      const project = projectMap.get(entry.project_id)
      const projectId = entry.project_id || 'sem-projeto'
      if (!projectCostMap.has(projectId)) {
        projectCostMap.set(projectId, {
          id: projectId,
          name: project?.name || 'Sem projeto',
          client: project?.client || null,
          status: project?.status || null,
          total_minutes: 0,
          total_cost: 0,
          entries_count: 0,
          collaborators: new Map(),
        })
      }

      const projectCost = projectCostMap.get(projectId)
      projectCost.total_minutes += minutes
      projectCost.total_cost += cost
      projectCost.entries_count += 1

      if (!projectCost.collaborators.has(entry.user_id)) {
        const profile = profileMap.get(entry.user_id)
        projectCost.collaborators.set(entry.user_id, {
          id: entry.user_id,
          name: profile?.name || 'Desconhecido',
          minutes: 0,
          cost: 0,
        })
      }
      const collaborator = projectCost.collaborators.get(entry.user_id)
      collaborator.minutes += minutes
      collaborator.cost += cost
    }

    for (const expense of expenses || []) {
      const user = ensureUser(expense.user_id)
      const amount = Number(expense.amount) || 0

      if (expense.status === 'approved') user.approved_expenses += amount
      if (expense.status === 'pending') user.pending_expenses += amount
      if (expense.status === 'rejected') user.rejected_expenses += amount
      addMovementDate(movementDates, expense.expense_date)
    }

    for (const bonus of bonuses || []) {
      const user = ensureUser(bonus.user_id)
      user.bonuses += Number(bonus.amount) || 0
      addMovementDate(movementDates, bonus.bonus_date)
    }

    for (const user of userMap.values()) {
      if (user.hourly_rate === 0 && user.total_minutes > 0) {
        alerts.push({
          type: 'warning',
          message: `${user.name} trabalhou no período, mas está com valor/hora zerado.`,
        })
      }
    }

    const byUser = Array.from(userMap.values())
      .filter((user) => (
        user.entries_count > 0 ||
        user.approved_expenses > 0 ||
        user.pending_expenses > 0 ||
        user.rejected_expenses > 0 ||
        user.bonuses > 0
      ))
      .map((user) => {
        const projectNames = Array.from(user.projects)
          .map((projectId) => projectMap.get(projectId)?.name)
          .filter(Boolean)
        const totalPayable = user.hours_cost + user.approved_expenses + user.bonuses

        return {
          ...user,
          working_days: user.working_days.size,
          projects_count: user.projects.size,
          projects: projectNames,
          total_hours: hoursFromMinutes(user.total_minutes),
          hours_cost: roundMoney(user.hours_cost),
          approved_expenses: roundMoney(user.approved_expenses),
          pending_expenses: roundMoney(user.pending_expenses),
          rejected_expenses: roundMoney(user.rejected_expenses),
          bonuses: roundMoney(user.bonuses),
          total_payable: roundMoney(totalPayable),
        }
      })
      .sort((a, b) => b.total_payable - a.total_payable)

    const totalMinutes = byUser.reduce((sum, user) => sum + user.total_minutes, 0)
    const hoursCost = byUser.reduce((sum, user) => sum + user.hours_cost, 0)
    const approvedExpenses = byUser.reduce((sum, user) => sum + user.approved_expenses, 0)
    const pendingExpenses = byUser.reduce((sum, user) => sum + user.pending_expenses, 0)
    const rejectedExpenses = byUser.reduce((sum, user) => sum + user.rejected_expenses, 0)
    const bonusTotal = byUser.reduce((sum, user) => sum + user.bonuses, 0)
    const totalPayable = hoursCost + approvedExpenses + bonusTotal
    const movementDays = movementDates.size

    if (pendingExpenses > 0) {
      alerts.push({
        type: 'info',
        message: `Existem despesas pendentes no período: R$ ${pendingExpenses.toFixed(2)}.`,
      })
    }

    const byProject = Array.from(projectCostMap.values())
      .filter((project) => project.total_minutes > 0)
      .map((project) => ({
        ...project,
        total_hours: hoursFromMinutes(project.total_minutes),
        total_cost: roundMoney(project.total_cost),
        average_hour_cost: project.total_minutes > 0
          ? roundMoney(project.total_cost / (project.total_minutes / 60))
          : 0,
        percent_of_hours_cost: hoursCost > 0
          ? Number(((project.total_cost / hoursCost) * 100).toFixed(1))
          : 0,
        collaborators_count: project.collaborators.size,
        collaborators: Array.from(project.collaborators.values())
          .map((collaborator) => ({
            ...collaborator,
            hours: hoursFromMinutes(collaborator.minutes),
            cost: roundMoney(collaborator.cost),
          }))
          .sort((a, b) => b.cost - a.cost),
      }))
      .sort((a, b) => b.total_cost - a.total_cost)

    const enrichedExpenses = (expenses || []).map((expense) => {
      const profile = profileMap.get(expense.user_id)
      return {
        ...expense,
        amount: roundMoney(expense.amount),
        profile: profile
          ? { id: profile.id, name: profile.name, email: profile.email, position: profile.position }
          : null,
      }
    })

    const enrichedBonuses = (bonuses || []).map((bonus) => {
      const profile = profileMap.get(bonus.user_id)
      return {
        ...bonus,
        amount: roundMoney(bonus.amount),
        profile: profile
          ? { id: profile.id, name: profile.name, email: profile.email, position: profile.position }
          : null,
      }
    })

    const enrichedEntries = (entries || [])
      .map((entry) => {
        const profile = profileMap.get(entry.user_id)
        const project = projectMap.get(entry.project_id)
        return {
          id: entry.id,
          started_at: entry.started_at,
          ended_at: entry.ended_at,
          duration_minutes: entry.duration_minutes || 0,
          hours: hoursFromMinutes(entry.duration_minutes),
          cost: roundMoney(entry.cost_snapshot),
          profile: profile
            ? { id: profile.id, name: profile.name, email: profile.email, position: profile.position }
            : null,
          project: project
            ? { id: project.id, name: project.name, client: project.client }
            : null,
        }
      })
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))

    const dailyHours = buildDailyHours(entries, profileMap, projectMap)

    return res.json({
      period: { start_date, end_date },
      summary: {
        total_minutes: totalMinutes,
        total_hours: hoursFromMinutes(totalMinutes),
        hours_cost: roundMoney(hoursCost),
        approved_expenses: roundMoney(approvedExpenses),
        pending_expenses: roundMoney(pendingExpenses),
        rejected_expenses: roundMoney(rejectedExpenses),
        bonuses: roundMoney(bonusTotal),
        total_payable: roundMoney(totalPayable),
        active_people: byUser.length,
        movement_days: movementDays,
        average_daily_cost: movementDays > 0 ? roundMoney(totalPayable / movementDays) : 0,
      },
      by_user: byUser,
      by_project: byProject,
      daily_hours: dailyHours,
      entries: enrichedEntries,
      expenses: enrichedExpenses,
      bonuses: enrichedBonuses,
      alerts,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/reports/daily-hours', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date, user_id } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  try {
    let sql = `SELECT id, user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot, status,
                      (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS local_day
               FROM time_entries
               WHERE status = 'completed'
                 AND ${TE_RANGE_SQL}`
    const params = [start_date, end_date]

    if (user_id) {
      sql += ` AND user_id = $${params.length + 1}`
      params.push(user_id)
    }

    sql += ` ORDER BY started_at DESC`

    const { rows: entries } = await query(sql, params)

    const { rows: profiles } = await query(
      `SELECT id, name, email, position FROM users`
    )
    const { rows: projects } = await query(
      `SELECT id, name, client FROM projects`
    )

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    const projectMap = new Map(projects.map((project) => [project.id, project]))

    const dailyHours = buildDailyHours(entries, profileMap, projectMap)

    return res.json({
      period: { start_date, end_date },
      daily_hours: dailyHours,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/reports/payroll', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  try {
    // Agregação feita no Postgres (GROUP BY) em vez de baixar todas as linhas
    // e somar em JS. As 3 CTEs somam por usuário; `ids` une todos os usuários
    // que aparecem em qualquer fonte (horas, despesas aprovadas, bônus).
    const { rows: records } = await query(
      `WITH hours AS (
         SELECT user_id, COALESCE(SUM(cost_snapshot), 0)::numeric AS hours_cost
         FROM time_entries
         WHERE status = 'completed'
           AND started_at >= ($1::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND started_at < (($2::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')
         GROUP BY user_id
       ),
       exp AS (
         SELECT user_id, COALESCE(SUM(amount), 0)::numeric AS expenses
         FROM expense_requests
         WHERE status = 'approved'
           AND expense_date >= $1::date AND expense_date <= $2::date
         GROUP BY user_id
       ),
       bon AS (
         SELECT user_id, COALESCE(SUM(amount), 0)::numeric AS bonuses
         FROM bonuses
         WHERE bonus_date >= $1::date AND bonus_date <= $2::date
         GROUP BY user_id
       ),
       ids AS (
         SELECT user_id FROM hours
         UNION SELECT user_id FROM exp
         UNION SELECT user_id FROM bon
       )
       SELECT ids.user_id AS id, u.name, u.email, u.position,
              COALESCE(h.hours_cost, 0) AS hours_cost,
              COALESCE(e.expenses, 0)   AS expenses,
              COALESCE(b.bonuses, 0)    AS bonuses
       FROM ids
       LEFT JOIN users u ON u.id = ids.user_id AND u.deleted_at IS NULL
       LEFT JOIN hours h ON h.user_id = ids.user_id
       LEFT JOIN exp e   ON e.user_id = ids.user_id
       LEFT JOIN bon b   ON b.user_id = ids.user_id`,
      [start_date, end_date]
    )

    const payroll = records
      .map((record) => ({
        id: record.id,
        name: record.name || 'Desconhecido',
        email: record.email || null,
        position: record.position || null,
        hours_cost: roundMoney(record.hours_cost),
        expenses: roundMoney(record.expenses),
        bonuses: roundMoney(record.bonuses),
        total: roundMoney(Number(record.hours_cost) + Number(record.expenses) + Number(record.bonuses)),
      }))
      .sort((a, b) => b.total - a.total)

    const summary = {
      total_hours_cost: payroll.reduce((sum, p) => sum + p.hours_cost, 0),
      total_expenses: payroll.reduce((sum, p) => sum + p.expenses, 0),
      total_bonuses: payroll.reduce((sum, p) => sum + p.bonuses, 0),
      total_payroll: payroll.reduce((sum, p) => sum + p.total, 0),
    }

    return res.json({
      period: { start_date, end_date },
      payroll,
      summary,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/reports/project-cost', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  try {
    // Agregação por projeto direto no Postgres. COUNT(DISTINCT user_id) dá o
    // nº de colaboradores sem precisar materializar um Set em JS.
    const { rows } = await query(
      `SELECT te.project_id,
              p.name   AS project_name,
              p.client AS project_client,
              COALESCE(SUM(te.duration_minutes), 0)::int AS total_minutes,
              COALESCE(SUM(te.cost_snapshot), 0)::numeric AS total_cost,
              COUNT(DISTINCT te.user_id)::int AS members_count
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.status = 'completed'
         AND te.started_at >= ($1::timestamp AT TIME ZONE 'America/Sao_Paulo')
         AND te.started_at < (($2::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')
       GROUP BY te.project_id, p.name, p.client`,
      [start_date, end_date]
    )

    const projectCosts = rows
      .map((row) => ({
        id: row.project_id || 'sem-projeto',
        name: row.project_name || 'Sem projeto',
        client: row.project_client || null,
        total_minutes: row.total_minutes,
        total_cost: roundMoney(row.total_cost),
        total_hours: hoursFromMinutes(row.total_minutes),
        members_count: row.members_count,
      }))
      .sort((a, b) => b.total_cost - a.total_cost)

    return res.json({
      period: { start_date, end_date },
      projects: projectCosts,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
