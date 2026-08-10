// Derivado, admin: quem está ativo mas não tem nenhum apontamento concluído no
// período. Útil para cobrança de folha de ponto.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'quem_nao_apontou',
    description: 'Pessoas ativas que não têm nenhum apontamento concluído no período. Use para saber quem ainda não bateu ponto.',
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
    `SELECT u.name AS pessoa
       FROM users u
      WHERE u.deleted_at IS NULL AND u.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM time_entries te
           WHERE te.user_id = u.id AND te.status = 'completed'
             AND te.started_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
             AND te.started_at < (($2::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')
        )
      ORDER BY u.name`,
    [inicio, fim],
  )
  return { data: rows, count: rows.length }
}

export default { kind: 'read', espelha: 'GET /admin/reports/financial', roles: ['admin'], definition, run }
