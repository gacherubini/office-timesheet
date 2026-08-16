// Espelha GET /admin/bonuses (bonuses.js:75, requireAdmin): lista de
// qualquer pessoa / período. Intern não tem a tool. Sem created_by.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'
import { resolverPessoa } from '../pessoas.js'

const definition = {
  type: 'function',
  function: {
    name: 'bonus_do_periodo',
    description:
      'Lista bônus de qualquer pessoa e/ou período. pessoa pelo nome; periodo (hoje/semana/mes) ou inicio+fim YYYY-MM-DD. Sem filtro, a lista inteira. Admin only.',
    parameters: {
      type: 'object',
      properties: {
        pessoa: { type: 'string', description: 'nome da pessoa; opcional' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'recorte opcional; não misture com inicio/fim' },
        inicio: { type: 'string', description: 'YYYY-MM-DD; use com fim' },
        fim: { type: 'string', description: 'YYYY-MM-DD; use com inicio' },
      },
      additionalProperties: false,
    },
  },
}

function toISODate(d) {
  if (d == null) return null
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

function janela(args) {
  const temInicio = args?.inicio != null && args.inicio !== ''
  const temFim = args?.fim != null && args.fim !== ''
  if (temInicio || temFim) {
    return { inicio: args.inicio, fim: args.fim }
  }
  if (args?.periodo) return resolvePeriodo(args.periodo)
  return null
}

async function run(_profile, args) {
  const conditions = []
  const params = []
  if (args?.pessoa) {
    const pessoa = await resolverPessoa(args.pessoa, { acao: 'listar os bônus' })
    conditions.push(`b.user_id = $${params.length + 1}`)
    params.push(pessoa.id)
  }
  const periodo = janela(args)
  if (periodo?.inicio) {
    conditions.push(`b.bonus_date >= $${params.length + 1}::date`)
    params.push(periodo.inicio)
  }
  if (periodo?.fim) {
    conditions.push(`b.bonus_date <= $${params.length + 1}::date`)
    params.push(periodo.fim)
  }

  let sql = `SELECT b.id, b.title, b.description, b.amount, b.bonus_date, u.name AS pessoa
               FROM bonuses b
               JOIN users u ON u.id = b.user_id`
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ' ORDER BY b.bonus_date DESC, b.created_at DESC'

  const { rows } = await query(sql, params)
  const data = rows.map((row) => ({
    id: row.id,
    pessoa: row.pessoa,
    titulo: row.title,
    descricao: row.description ?? null,
    valor: Number(row.amount),
    data: toISODate(row.bonus_date),
  }))
  return { data, count: data.length }
}

export default {
  kind: 'read',
  espelha: 'GET /admin/bonuses',
  roles: ['admin'],
  definition,
  run,
}
