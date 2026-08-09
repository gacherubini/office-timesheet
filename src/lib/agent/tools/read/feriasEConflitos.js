// Espelha GET /vacation-calendar (requireAuth): férias aprovadas que tocam o
// período. Além de listar, detecta sobreposições (duas pessoas fora ao mesmo
// tempo) — comparação de pares em JS, barata para o volume de um estúdio.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'ferias_e_conflitos',
    description: 'Férias aprovadas no período e sobreposições (duas ou mais pessoas de férias ao mesmo tempo). Use para planejar cobertura.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

function sobrepoe(a, b) {
  return a.inicio <= b.fim && b.inicio <= a.fim
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa, v.start_date AS inicio, v.end_date AS fim, v.days_count AS dias
       FROM vacation_requests v JOIN users u ON u.id = v.user_id
      WHERE v.status = 'approved'
        AND v.start_date <= $2::date AND v.end_date >= $1::date
      ORDER BY v.start_date ASC`,
    [inicio, fim],
  )
  const ferias = rows.map((r) => ({ pessoa: r.pessoa, inicio: r.inicio, fim: r.fim, dias: r.dias }))
  const conflitos = []
  for (let i = 0; i < ferias.length; i++) {
    for (let j = i + 1; j < ferias.length; j++) {
      if (sobrepoe(ferias[i], ferias[j])) {
        conflitos.push({ pessoa_a: ferias[i].pessoa, pessoa_b: ferias[j].pessoa })
      }
    }
  }
  return { data: { ferias, conflitos }, count: ferias.length }
}

export default {
  kind: 'read', espelha: 'GET /vacation-calendar',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
