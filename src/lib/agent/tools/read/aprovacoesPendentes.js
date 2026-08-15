// Espelha GET /admin/expense-requests?status=pending (expenses.js:130,
// requireApprover) e GET /admin/vacation-requests?status=pending
// (vacations.js:245, requireCanViewVacationApprovals). Mesmos SELECTs +
// enrich; férias filtradas com canApproveVacationRequest (intern não vê
// pedido de outro intern). Sem receipt_url, sem admin_note, sem bônus.
import { query } from '../../../db.js'
import { canApproveVacationRequest } from '../../../permissions.js'

const definition = {
  type: 'function',
  function: {
    name: 'aprovacoes_pendentes',
    description:
      'Despesas e férias pendentes de aprovação agora. Não inclui bônus (não há fila). Use o id retornado para propor aprovar ou rejeitar — não invente id.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}

function toISODate(d) {
  if (d == null) return null
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

async function enrichExpenseRequests(expenses) {
  const rows = expenses || []
  if (rows.length === 0) return []
  const userIds = [...new Set(rows.map((expense) => expense.user_id).filter(Boolean))]
  if (userIds.length === 0) return rows
  const { rows: profiles } = await query(
    'SELECT id, name, email, position, avatar_url FROM users WHERE id = ANY($1)',
    [userIds],
  )
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  return rows.map((expense) => ({
    ...expense,
    profile: profileMap.get(expense.user_id) || null,
  }))
}

async function enrichVacationRequests(vacations) {
  const rows = vacations || []
  if (rows.length === 0) return []
  const userIds = [...new Set(rows.map((vacation) => vacation.user_id).filter(Boolean))]
  if (userIds.length === 0) return rows
  const { rows: profiles } = await query(
    'SELECT id, name, email, position, avatar_url, role FROM users WHERE id = ANY($1)',
    [userIds],
  )
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  return rows.map((vacation) => ({
    ...vacation,
    profile: profileMap.get(vacation.user_id) || null,
  }))
}

async function run(profile) {
  const { rows: expenseRows } = await query(
    `SELECT id, user_id, title, description, amount, expense_date, status, decided_by, decided_at, created_at, updated_at
       FROM expense_requests
      WHERE status = $1
      ORDER BY created_at DESC`,
    ['pending'],
  )
  const { rows: vacationRows } = await query(
    `SELECT id, user_id, start_date, end_date, days_count, reason, status, decided_by, decided_at, created_at, updated_at
       FROM vacation_requests
      WHERE status = $1
      ORDER BY created_at DESC`,
    ['pending'],
  )

  const despesas = (await enrichExpenseRequests(expenseRows)).map((e) => ({
    id: e.id,
    pessoa: e.profile?.name ?? null,
    titulo: e.title,
    valor: Number(e.amount),
    data: toISODate(e.expense_date),
  }))

  const ferias = (await enrichVacationRequests(vacationRows))
    .filter((v) => canApproveVacationRequest(profile, v.profile))
    .map((v) => ({
      id: v.id,
      pessoa: v.profile?.name ?? null,
      inicio: toISODate(v.start_date),
      fim: toISODate(v.end_date),
      dias: v.days_count,
      motivo: v.reason ?? null,
    }))

  return { data: { despesas, ferias }, count: despesas.length + ferias.length }
}

export default {
  kind: 'read',
  espelha: 'GET /admin/expense-requests + GET /admin/vacation-requests',
  roles: ['admin', 'administrative_intern'],
  definition,
  run,
}
