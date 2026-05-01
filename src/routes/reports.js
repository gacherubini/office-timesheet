import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { adminClient } from '../lib/supabase.js'

const router = Router()

function startOfDayIso(date) {
  return new Date(`${date}T00:00:00`).toISOString()
}

function endOfDayIso(date) {
  return new Date(`${date}T23:59:59`).toISOString()
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function hoursFromMinutes(minutes) {
  return Number(((Number(minutes) || 0) / 60).toFixed(2))
}

function addMovementDate(set, value) {
  if (value) set.add(String(value).slice(0, 10))
}

router.get('/reports/financial', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  const [
    { data: entries, error: entriesError },
    { data: expenses, error: expensesError },
    { data: bonuses, error: bonusesError },
    { data: profiles, error: profilesError },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    adminClient
      .from('time_entries')
      .select('id, user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot, status')
      .eq('status', 'completed')
      .gte('started_at', startOfDayIso(start_date))
      .lte('started_at', endOfDayIso(end_date)),
    adminClient
      .from('expense_requests')
      .select('id, user_id, title, description, amount, expense_date, receipt_url, status, created_at')
      .gte('expense_date', start_date)
      .lte('expense_date', end_date)
      .order('expense_date', { ascending: false }),
    adminClient
      .from('bonuses')
      .select('id, user_id, title, description, amount, bonus_date, created_at')
      .gte('bonus_date', start_date)
      .lte('bonus_date', end_date)
      .order('bonus_date', { ascending: false }),
    adminClient
      .from('profiles')
      .select('id, name, email, position, hourly_rate'),
    adminClient
      .from('projects')
      .select('id, name, client, status'),
  ])

  if (entriesError) return res.status(400).json({ error: entriesError.message })
  if (expensesError) return res.status(400).json({ error: expensesError.message })
  if (bonusesError) return res.status(400).json({ error: bonusesError.message })
  if (profilesError) return res.status(400).json({ error: profilesError.message })
  if (projectsError) return res.status(400).json({ error: projectsError.message })

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const projectMap = new Map((projects || []).map((project) => [project.id, project]))
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
    const day = entry.started_at?.slice(0, 10)

    user.total_minutes += minutes
    user.hours_cost += cost
    user.entries_count += 1
    if (day) user.working_days.add(day)
    if (entry.project_id) user.projects.add(entry.project_id)
    addMovementDate(movementDates, entry.started_at)

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
    entries: enrichedEntries,
    expenses: enrichedExpenses,
    bonuses: enrichedBonuses,
    alerts,
  })
})

router.get('/reports/payroll', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  const [
    { data: entries, error: entriesError },
    { data: expenses, error: expensesError },
    { data: bonuses, error: bonusesError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    adminClient
      .from('time_entries')
      .select('user_id, duration_minutes, cost_snapshot')
      .eq('status', 'completed')
      .gte('started_at', startOfDayIso(start_date))
      .lte('started_at', endOfDayIso(end_date)),
    adminClient
      .from('expense_requests')
      .select('user_id, amount')
      .eq('status', 'approved')
      .gte('expense_date', start_date)
      .lte('expense_date', end_date),
    adminClient
      .from('bonuses')
      .select('user_id, amount')
      .gte('bonus_date', start_date)
      .lte('bonus_date', end_date),
    adminClient
      .from('profiles')
      .select('id, name, email, hourly_rate'),
  ])

  if (entriesError) return res.status(400).json({ error: entriesError.message })
  if (expensesError) return res.status(400).json({ error: expensesError.message })
  if (bonusesError) return res.status(400).json({ error: bonusesError.message })
  if (profilesError) return res.status(400).json({ error: profilesError.message })

  const userMap = {}
  for (const profile of profiles) {
    userMap[profile.id] = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      hourly_rate: Number(profile.hourly_rate) || 0,
      total_minutes: 0,
      total_hours: 0,
      total_cost: 0,
      total_expenses: 0,
      total_bonuses: 0,
      entries_count: 0,
    }
  }

  for (const entry of entries || []) {
    if (userMap[entry.user_id]) {
      userMap[entry.user_id].total_minutes += entry.duration_minutes || 0
      userMap[entry.user_id].total_cost += Number(entry.cost_snapshot) || 0
      userMap[entry.user_id].entries_count += 1
    }
  }

  for (const expense of expenses || []) {
    if (userMap[expense.user_id]) {
      userMap[expense.user_id].total_expenses += Number(expense.amount) || 0
    }
  }

  for (const bonus of bonuses || []) {
    if (userMap[bonus.user_id]) {
      userMap[bonus.user_id].total_bonuses += Number(bonus.amount) || 0
    }
  }

  const payroll = Object.values(userMap)
    .filter((u) => u.entries_count > 0 || u.total_expenses > 0 || u.total_bonuses > 0)
    .map((u) => ({
      ...u,
      total_hours: hoursFromMinutes(u.total_minutes),
      total_cost: roundMoney(u.total_cost),
      total_expenses: roundMoney(u.total_expenses),
      total_bonuses: roundMoney(u.total_bonuses),
      total_to_pay: roundMoney(u.total_cost + u.total_expenses + u.total_bonuses),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const grandTotal = payroll.reduce((sum, u) => sum + u.total_to_pay, 0)

  return res.json({
    period: { start_date, end_date },
    payroll,
    grand_total: roundMoney(grandTotal),
  })
})

router.get('/reports/project-cost', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date, project_id } = req.query

  let query = adminClient
    .from('time_entries')
    .select('project_id, user_id, duration_minutes, cost_snapshot')
    .eq('status', 'completed')

  if (start_date) query = query.gte('started_at', startOfDayIso(start_date))
  if (end_date) query = query.lte('started_at', endOfDayIso(end_date))
  if (project_id) query = query.eq('project_id', project_id)

  const { data: entries, error: entriesError } = await query

  if (entriesError) {
    return res.status(400).json({ error: entriesError.message })
  }

  const { data: projects } = await adminClient
    .from('projects')
    .select('id, name, client, status')

  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, name')

  const projectMap = {}
  for (const p of projects || []) {
    projectMap[p.id] = { ...p, total_minutes: 0, total_hours: 0, total_cost: 0, collaborators: {} }
  }

  const profileMap = {}
  for (const p of profiles || []) {
    profileMap[p.id] = p.name
  }

  for (const entry of entries || []) {
    const proj = projectMap[entry.project_id]
    if (!proj) continue

    proj.total_minutes += entry.duration_minutes || 0
    proj.total_cost += Number(entry.cost_snapshot) || 0

    const userName = profileMap[entry.user_id] || 'Desconhecido'
    if (!proj.collaborators[entry.user_id]) {
      proj.collaborators[entry.user_id] = { name: userName, minutes: 0, cost: 0 }
    }
    proj.collaborators[entry.user_id].minutes += entry.duration_minutes || 0
    proj.collaborators[entry.user_id].cost += Number(entry.cost_snapshot) || 0
  }

  const result = Object.values(projectMap)
    .filter((p) => p.total_minutes > 0 || project_id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      status: p.status,
      total_hours: hoursFromMinutes(p.total_minutes),
      total_cost: roundMoney(p.total_cost),
      collaborators: Object.values(p.collaborators).map((c) => ({
        ...c,
        hours: hoursFromMinutes(c.minutes),
        cost: roundMoney(c.cost),
      })),
    }))
    .sort((a, b) => b.total_cost - a.total_cost)

  return res.json({
    period: { start_date: start_date || null, end_date: end_date || null },
    projects: result,
  })
})

export default router
