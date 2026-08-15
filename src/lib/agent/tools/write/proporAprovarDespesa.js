// Espelha POST /admin/expense-requests/:id/approve (expenses.js:127,
// requireAuth + requireApprover). Propõe aprovar uma despesa pendente.
// propose não grava; execute revalida com UPDATE … status='pending'.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_aprovar_despesa',
    description: 'Propõe aprovar uma despesa pendente. Requer confirmação. Use o id que veio da ferramenta de pendências. Não invente id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id da despesa pendente, vindo da ferramenta de pendências' },
        nota: { type: 'string', description: 'nota interna, opcional' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
}

function toISODate(d) {
  if (d == null) return null
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

function notaDe(args) {
  return typeof args?.nota === 'string' ? args.nota.trim() || null : null
}

async function carregar(id) {
  if (!id) throw new Error('Não encontrei essa solicitação.')
  const { rows } = await query(
    `SELECT er.id, er.user_id, er.title, er.amount, er.expense_date, er.status,
            u.name AS pessoa
       FROM expense_requests er
       LEFT JOIN users u ON u.id = er.user_id
      WHERE er.id = $1`,
    [id],
  )
  if (!rows.length) throw new Error('Não encontrei essa solicitação.')
  return rows[0]
}

async function propose(_profile, args) {
  const row = await carregar(args?.id)
  if (row.status !== 'pending') throw new Error('Despesa pendente não encontrada.')
  const admin_note = notaDe(args)
  const valor = Number(row.amount)
  return {
    kind: 'aprovar_despesa',
    payload: { id: row.id, admin_note },
    descricao: `Aprovar despesa "${row.title}" de ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${row.pessoa || 'colaborador'}.`,
    dados: {
      pessoa: row.pessoa ?? null,
      titulo: row.title,
      valor,
      data: toISODate(row.expense_date),
      nota: admin_note,
    },
  }
}

async function execute(profile, payload) {
  const adminNote = typeof payload?.admin_note === 'string' ? payload.admin_note.trim() || null : payload?.admin_note ?? null
  const decidedAt = new Date().toISOString()
  const { rows } = await query(
    `UPDATE expense_requests
     SET status = 'approved', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
     WHERE id = $4 AND status = 'pending'
     RETURNING id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_by, decided_at, created_at, updated_at`,
    [adminNote, profile.id, decidedAt, payload.id],
  )
  if (!rows || rows.length === 0) throw new Error('Despesa pendente não encontrada.')
  return { before: { id: payload.id, status: 'pending' }, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /admin/expense-requests/:id/approve',
  roles: ['admin', 'administrative_intern'],
  definition, propose, execute,
}
