// Espelha GET /tasks (requireAuth, sem recorte por papel): tasks em in_review
// paradas há mais de N dias, ou abandonadas. dias_parada usa updated_at como
// aproximação de "sem mexer desde".
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'tasks_travadas',
    description: 'Tarefas travadas: em revisão (in_review) há mais de N dias, ou abandonadas. Use para achar o que está preso no fluxo.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'limite de dias em revisão; padrão 3' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const dias = Number.isFinite(args?.dias) && args.dias > 0 ? Math.floor(args.dias) : 3
  const { rows } = await query(
    `SELECT t.title AS titulo, p.name AS projeto, t.status,
            EXTRACT(DAY FROM now() - t.updated_at)::int AS dias_parada
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'abandoned'
         OR (t.status = 'in_review' AND t.updated_at < now() - ($1 || ' days')::interval)
      ORDER BY t.updated_at ASC`,
    [String(dias)],
  )
  return { data: rows, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
