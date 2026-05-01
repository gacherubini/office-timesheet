import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { adminClient } from '../lib/supabase.js'

const router = Router()

// ─── FOLHA DE PAGAMENTO ───────────────────────────────────────────────
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
      .gte('started_at', new Date(start_date).toISOString())
      .lte('started_at', new Date(end_date).toISOString()),
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
      total_hours: Number((u.total_minutes / 60).toFixed(2)),
      total_cost: Number(u.total_cost.toFixed(2)),
      total_expenses: Number(u.total_expenses.toFixed(2)),
      total_bonuses: Number(u.total_bonuses.toFixed(2)),
      total_to_pay: Number((u.total_cost + u.total_expenses + u.total_bonuses).toFixed(2)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const grandTotal = payroll.reduce((sum, u) => sum + u.total_to_pay, 0)

  return res.json({
    period: { start_date, end_date },
    payroll,
    grand_total: Number(grandTotal.toFixed(2)),
  })
})

// ─── CUSTO POR PROJETO ───────────────────────────────────────────────
router.get('/reports/project-cost', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date, project_id } = req.query

  // Busca apontamentos completed, com filtros opcionais
  let query = adminClient
    .from('time_entries')
    .select('project_id, user_id, duration_minutes, cost_snapshot')
    .eq('status', 'completed')

  if (start_date) query = query.gte('started_at', new Date(start_date).toISOString())
  if (end_date) query = query.lte('started_at', new Date(end_date).toISOString())
  if (project_id) query = query.eq('project_id', project_id)

  const { data: entries, error: entriesError } = await query

  if (entriesError) {
    return res.status(400).json({ error: entriesError.message })
  }

  // Busca projetos e colaboradores
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

  // Agrupa por projeto e colaborador
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

  // Monta resultado
  const result = Object.values(projectMap)
    .filter((p) => p.total_minutes > 0 || project_id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      status: p.status,
      total_hours: Number((p.total_minutes / 60).toFixed(2)),
      total_cost: Number(p.total_cost.toFixed(2)),
      collaborators: Object.values(p.collaborators).map((c) => ({
        ...c,
        hours: Number((c.minutes / 60).toFixed(2)),
        cost: Number(c.cost.toFixed(2)),
      })),
    }))
    .sort((a, b) => b.total_cost - a.total_cost)

  return res.json({
    period: { start_date: start_date || null, end_date: end_date || null },
    projects: result,
  })
})

export default router
