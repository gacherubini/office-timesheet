// Espelha GET /projects (projects.js:30, requireAuth) + GET /tasks/counts
// (projectManagement.js:145, requireAuth) — ambos sem recorte por papel. Retrato
// de um projeto (ou de todos os ativos): status, tarefas por coluna do kanban e
// horas apontadas. project_status só tem dois valores (002_enums.sql): 'active'
// e 'completed'. LATERAL para não inflar horas/contagens (fan-out).
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'status_projeto',
    description: 'Retrato de um projeto (ou de todos os ativos): status (active/completed), tarefas por coluna do kanban (todo, in_progress, in_review, done, abandoned) e horas já apontadas. Passe projeto_id para um projeto específico.',
    parameters: {
      type: 'object',
      properties: { projeto_id: { type: 'string', description: 'id do projeto; se omitido, traz todos os projetos ativos' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const id = args?.projeto_id || null
  const { rows } = await query(
    `SELECT p.name AS projeto, COALESCE(c.name, p.client) AS cliente, p.status,
            tc.todo, tc.in_progress, tc.in_review, tc.done, tc.abandoned, tc.total_tarefas,
            COALESCE(hc.total_minutes, 0) AS total_minutes
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_tarefas,
                COUNT(*) FILTER (WHERE status = 'todo')::int        AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'in_review')::int   AS in_review,
                COUNT(*) FILTER (WHERE status = 'done')::int        AS done,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int   AS abandoned
           FROM tasks WHERE project_id = p.id
       ) tc ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(duration_minutes),0)::int AS total_minutes
           FROM time_entries WHERE project_id = p.id AND status = 'completed'
       ) hc ON true
      WHERE p.deleted_at IS NULL
        AND ($1::uuid IS NULL OR p.id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR p.status = 'active')
      ORDER BY p.name`,
    [id],
  )
  const data = rows.map((r) => ({
    projeto: r.projeto,
    cliente: r.cliente || null,
    status: r.status,
    tarefas: {
      todo: r.todo, in_progress: r.in_progress, in_review: r.in_review,
      done: r.done, abandoned: r.abandoned, total: r.total_tarefas,
    },
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
  }))
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /projects + GET /tasks/counts',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
