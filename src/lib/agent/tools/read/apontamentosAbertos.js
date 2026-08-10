// Espelha GET /admin/live (timeEntries.js:560, requireAuth +
// requireOperationalAccess = admin + estagiário administrativo). Diferença
// deliberada de recorte: o endpoint lista TODO mundo e marca 'offline' quem não
// tem apontamento, porque alimenta um painel; a pergunta de gestão é "quem está
// apontando agora?", então a tool devolve só as linhas abertas. É recorte para
// menos, não para mais — nenhuma linha nova é exposta.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'apontamentos_abertos',
    description: 'Quem está com o apontamento aberto agora (timer rodando ou pausado): pessoa, projeto, status e há quanto tempo. Use para "quem está trabalhando agora?".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}

async function run() {
  const { rows } = await query(
    `SELECT u.name AS pessoa, te.status, p.name AS projeto, te.started_at AS desde,
            EXTRACT(EPOCH FROM (now() - te.started_at)) / 3600 AS horas
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.status IN ('running', 'paused')
        AND u.deleted_at IS NULL AND u.is_active = true
      ORDER BY te.started_at`,
  )
  const data = rows.map((r) => ({
    pessoa: r.pessoa,
    status: r.status,
    projeto: r.projeto || null,
    desde: r.desde,
    horas_em_aberto: Number(Number(r.horas).toFixed(2)),
  }))
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /admin/live',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
