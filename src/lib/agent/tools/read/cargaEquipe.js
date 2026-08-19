// Derivado, admin: horas apontadas no período + tarefas abertas atribuídas, por
// pessoa. Ajuda a ver sobrecarga (muitas horas/tarefas) e ociosidade (zero).
// "Aberta" = não chegou a um status terminal (done/abandoned) — inclui
// `blocked` ("Falta info") de propósito: a tarefa travada esperando terceiro
// continua sob a responsabilidade da pessoa (ela precisa cobrar o cliente, ir
// atrás da topografia etc.), só não avança sozinha. Tirar `blocked` da conta
// faria a carga da pessoa CAIR quando uma tarefa trava — o oposto do que
// "carga" deveria mostrar.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'carga_equipe',
    description: 'Carga da equipe num período: horas apontadas, nº de apontamentos e nº de tarefas abertas por pessoa. Use para ver quem está sobrecarregado ou ocioso.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa,
            COALESCE(SUM(te.duration_minutes),0)::int AS total_minutes,
            COUNT(te.id)::int AS apontamentos,
            (SELECT COUNT(*) FROM tasks tk
              WHERE tk.assignee_id = u.id
                AND tk.status IN ('todo','in_progress','blocked','in_review'))::int AS tarefas_abertas
       FROM users u
       LEFT JOIN time_entries te
         ON te.user_id = u.id AND te.status = 'completed'
        AND te.started_at >= ($1::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND te.started_at < (($2::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')
      WHERE u.deleted_at IS NULL AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_minutes DESC, u.name`,
    [inicio, fim],
  )
  const data = rows.map((r) => ({
    pessoa: r.pessoa,
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
    apontamentos: r.apontamentos,
    tarefas_abertas: r.tarefas_abertas,
  }))
  return { data, count: data.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/financial (by_user)', roles: ['admin'], definition, run }
