import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { query } from '../lib/db.js'

const router = Router()

router.get('/dashboard', requireAuth, requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.query

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date e end_date são obrigatórios.' })
  }

  try {
    const [
      { rows: entries },
      { rows: profiles },
      { rows: projects },
    ] = await Promise.all([
      query(
        `SELECT user_id, project_id, duration_minutes, cost_snapshot
         FROM time_entries
         WHERE status = 'completed'
           AND started_at >= $1::date AND started_at < ($2::date + interval '1 day')`,
        [start_date, end_date]
      ),
      query(
        `SELECT id, name, position, is_active, avatar_url FROM users WHERE deleted_at IS NULL`
      ),
      query(
        `SELECT id, name, status, sale_value FROM projects WHERE deleted_at IS NULL`
      ),
    ])

    const profileMap = {}
    for (const p of profiles || []) profileMap[p.id] = p

    const projectMap = {}
    for (const p of projects || []) projectMap[p.id] = p

    let teamCost = 0
    let totalMinutes = 0

    const teamStats = {}
    const projectStats = {}

    for (const entry of entries || []) {
      const cost = Number(entry.cost_snapshot) || 0
      const minutes = entry.duration_minutes || 0

      teamCost += cost
      totalMinutes += minutes

      if (!teamStats[entry.user_id]) {
        teamStats[entry.user_id] = { user_id: entry.user_id, total_minutes: 0, projects: new Set() }
      }
      teamStats[entry.user_id].total_minutes += minutes
      teamStats[entry.user_id].projects.add(entry.project_id)

      if (!projectStats[entry.project_id]) {
        projectStats[entry.project_id] = { project_id: entry.project_id, total_minutes: 0, members: new Set() }
      }
      projectStats[entry.project_id].total_minutes += minutes
      projectStats[entry.project_id].members.add(entry.user_id)
    }

    const activeProjects = (projects || []).filter((p) => p.status === 'active')
    const potentialRevenue = activeProjects.reduce((sum, p) => sum + (Number(p.sale_value) || 0), 0)

    const activeUsers = (profiles || []).filter((p) => p.is_active).length
    const totalUsers = (profiles || []).length
    const activeProjectsCount = activeProjects.length
    const totalProjectsCount = (projects || []).length

    const team = Object.values(teamStats)
      .map((s) => ({
        user_id: s.user_id,
        name: profileMap[s.user_id]?.name || 'Desconhecido',
        position: profileMap[s.user_id]?.position || null,
        avatar_url: profileMap[s.user_id]?.avatar_url || null,
        total_minutes: s.total_minutes,
        project_count: s.projects.size,
      }))
      .sort((a, b) => b.total_minutes - a.total_minutes)

    const projectsRanking = Object.values(projectStats)
      .map((s) => ({
        project_id: s.project_id,
        name: projectMap[s.project_id]?.name || 'Desconhecido',
        total_minutes: s.total_minutes,
        member_count: s.members.size,
      }))
      .sort((a, b) => b.total_minutes - a.total_minutes)

    return res.json({
      period: { start_date, end_date },
      kpis: {
        potential_revenue: Number(potentialRevenue.toFixed(2)),
        team_cost: Number(teamCost.toFixed(2)),
        projected_profit: Number((potentialRevenue - teamCost).toFixed(2)),
        total_minutes: totalMinutes,
        active_users: activeUsers,
        total_users: totalUsers,
        active_projects: activeProjectsCount,
        total_projects: totalProjectsCount,
      },
      team,
      projects: projectsRanking,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
