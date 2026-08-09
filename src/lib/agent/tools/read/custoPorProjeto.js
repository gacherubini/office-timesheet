// src/lib/agent/tools/read/custoPorProjeto.js
// Espelha GET /admin/reports/project-cost (requireAdmin). Soma cost_snapshot por
// projeto no período. Rótulo é "custo dos horistas" (§8.1): salário fixo aponta
// com custo zero, então isto não é o custo total de mão de obra.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'custo_por_projeto',
    description: 'Custo dos horistas por projeto num período (soma do custo congelado dos apontamentos concluídos). Não inclui quem tem salário fixo.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão mes' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT p.name AS projeto, p.client AS cliente,
            COALESCE(SUM(te.duration_minutes),0)::int AS total_minutes,
            COALESCE(SUM(te.cost_snapshot),0)::numeric AS custo_horistas,
            COUNT(DISTINCT te.user_id)::int AS pessoas
       FROM time_entries te LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.status = 'completed'
        AND te.started_at >= $1::date AND te.started_at < ($2::date + interval '1 day')
      GROUP BY p.id, p.name, p.client
      ORDER BY custo_horistas DESC`,
    [inicio, fim],
  )
  const data = rows.map((r) => ({
    projeto: r.projeto || 'Sem projeto',
    cliente: r.cliente || null,
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
    custo_horistas: Number(Number(r.custo_horistas).toFixed(2)),
    pessoas: r.pessoas,
  }))
  return { data, count: data.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/project-cost', roles: ['admin'], definition, run }
