// Espelha GET /me/bonuses (bonuses.js:59, requireAuth): só as linhas do
// profile.id. Sem parâmetro de pessoa. Sem user_id / created_by no JSON.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'meus_bonus',
    description:
      'Lista os bônus da pessoa que está falando. Sem parâmetro de outra gente. periodo opcional (hoje/semana/mes) recorta por data; sem período, a lista inteira.',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'recorte opcional em bonus_date' },
      },
      additionalProperties: false,
    },
  },
}

function toISODate(d) {
  if (d == null) return null
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

function mapear(row) {
  return {
    id: row.id,
    titulo: row.title,
    descricao: row.description ?? null,
    valor: Number(row.amount),
    data: toISODate(row.bonus_date),
  }
}

async function run(profile, args) {
  const params = [profile.id]
  let sql = `SELECT id, title, description, amount, bonus_date
               FROM bonuses
              WHERE user_id = $1`
  if (args?.periodo) {
    const { inicio, fim } = resolvePeriodo(args.periodo)
    sql += ` AND bonus_date >= $2::date AND bonus_date <= $3::date`
    params.push(inicio, fim)
  }
  sql += ' ORDER BY bonus_date DESC, created_at DESC'
  const { rows } = await query(sql, params)
  const data = rows.map(mapear)
  return { data, count: data.length }
}

export default {
  kind: 'read',
  espelha: 'GET /me/bonuses',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition,
  run,
}
