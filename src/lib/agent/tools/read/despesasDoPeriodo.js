// Espelha GET /admin/expense-requests (expenses.js:130, requireAuth +
// requireApprover = admin + estagiário administrativo): total de despesas
// APROVADAS no período. GLOBAL, nunca por projeto — expense_requests não tem
// project_id (007_expenses.sql), então qualquer recorte por projeto seria
// número inventado. É o que sobrou do resumo_financeiro depois que receita e
// margem saíram da fase (§8.1).
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'despesas_do_periodo',
    description: 'Total de despesas APROVADAS no período, com quebra por pessoa. É sempre global: despesa não é atribuível a projeto neste sistema, então não tente cruzar com projeto.',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão mes' },
      },
      additionalProperties: false,
    },
  },
}

const dinheiro = (n) => Number(Number(n || 0).toFixed(2))

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa, COUNT(*)::int AS quantidade, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_requests e
       JOIN users u ON u.id = e.user_id
      WHERE e.status = 'approved'
        AND e.expense_date >= $1::date
        AND e.expense_date <= $2::date
      GROUP BY u.name
      ORDER BY total DESC, pessoa`,
    [inicio, fim],
  )
  const data = {
    periodo: { inicio, fim },
    total_aprovado: dinheiro(rows.reduce((s, r) => s + Number(r.total), 0)),
    quantidade: rows.reduce((s, r) => s + r.quantidade, 0),
    por_pessoa: rows.map((r) => ({
      pessoa: r.pessoa,
      quantidade: r.quantidade,
      total: dinheiro(r.total),
    })),
  }
  return { data, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /admin/expense-requests',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
