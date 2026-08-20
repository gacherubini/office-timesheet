import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { query } from '../lib/db.js'
import { usuariosOnline } from '../lib/onlineUsers.js'

const router = Router()

// Idade máxima de um cronômetro aberto para ele ainda valer como presença.
// Lido de env pelo mesmo motivo do PRESENCE_WINDOW_MS do onlineUsers.js: deixa
// o teste encurtar a janela sem esperar 12 horas.
const JANELA_CRONOMETRO = process.env.TIMER_PRESENCE_WINDOW || '12 hours'

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
      { rows: running },
    ] = await Promise.all([
      query(
        `SELECT user_id, project_id, duration_minutes, cost_snapshot
         FROM time_entries
         WHERE status = 'completed'
           AND started_at >= ($1::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND started_at < (($2::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
        [start_date, end_date]
      ),
      query(
        `SELECT id, name, position, is_active, avatar_url FROM users WHERE deleted_at IS NULL`
      ),
      query(
        `SELECT id, name, status, sale_value FROM projects WHERE deleted_at IS NULL`
      ),
      // Cronômetro rodando — a segunda fonte de "online", e são DOIS
      // cronômetros diferentes: o ponto (time_entries) e o de tarefa
      // (task_time_logs, o botão "Contar horas" que o item 8 do PDF colocou em
      // todo card do quadro). Quem está com qualquer um dos dois aberto está
      // trabalhando, mesmo com a aba fechada mandando zero heartbeat. UNION
      // (não UNION ALL) porque o mesmo usuário costuma ter os dois.
      //
      // O CORTE DE 12h existe porque cronômetro esquecido não é presença. Sem
      // ele, quem fechou o notebook na sexta sem parar o timer apareceria
      // "online" na segunda de manhã — e o número pararia de responder a quem
      // entra e sai, que é exatamente o que o item 9 do PDF veio consertar. A
      // janela é longa de propósito: maior que qualquer sessão real de
      // trabalho, para nunca esconder alguém que está de fato trabalhando.
      query(
        `SELECT user_id FROM time_entries
          WHERE status = 'running' AND started_at > now() - $1::interval
          UNION
         SELECT user_id FROM task_time_logs
          WHERE ended_at IS NULL AND started_at > now() - $1::interval`,
        [JANELA_CRONOMETRO]
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
    // "Online" = sinal recente no processo (request ou heartbeat) OU cronômetro
    // rodando. O Set já deduplica quem satisfaz os dois. O filtro por is_active
    // evita contar quem foi desligado mas ainda tinha um timer aberto.
    const idsOnline = usuariosOnline()
    for (const r of running || []) idsOnline.add(r.user_id)
    const onlineUsers = (profiles || []).filter((p) => p.is_active && idsOnline.has(p.id)).length
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
        online_users: onlineUsers,
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
