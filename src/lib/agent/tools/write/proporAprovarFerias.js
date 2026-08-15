// Espelha POST /admin/vacation-requests/:id/approve (vacations.js:272,
// requireAuth + requireCanViewVacationApprovals + canApproveVacationRequest).
// propose não grava; execute revalida com UPDATE … status='pending'.
import { query } from '../../../db.js'
import { canApproveVacationRequest } from '../../../permissions.js'
import { stopRunningTimerForUser } from '../../../vacationTimer.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_aprovar_ferias',
    description: 'Propõe aprovar uma solicitação de férias pendente. Requer confirmação. Use o id que veio da ferramenta de pendências. Não invente id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id da solicitação pendente, vindo da ferramenta de pendências' },
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
    `SELECT vr.id, vr.user_id, vr.start_date, vr.end_date, vr.days_count, vr.reason, vr.status,
            u.name AS pessoa, u.role AS user_role
       FROM vacation_requests vr
       LEFT JOIN users u ON u.id = vr.user_id
      WHERE vr.id = $1`,
    [id],
  )
  if (!rows.length) throw new Error('Não encontrei essa solicitação.')
  return rows[0]
}

function recusarSeNaoPode(profile, targetRole) {
  if (!canApproveVacationRequest(profile, { role: targetRole })) {
    throw new Error('Você não tem permissão para aprovar esta solicitação.')
  }
}

async function propose(profile, args) {
  const row = await carregar(args?.id)
  if (row.status !== 'pending') throw new Error('Esta solicitação já foi decidida.')
  if (!row.user_role) throw new Error('Colaborador não encontrado.')
  recusarSeNaoPode(profile, row.user_role)
  const admin_note = notaDe(args)
  const inicio = toISODate(row.start_date)
  const fim = toISODate(row.end_date)
  return {
    kind: 'aprovar_ferias',
    payload: { id: row.id, admin_note },
    descricao: `Aprovar férias de ${row.pessoa || 'colaborador'} de ${inicio} a ${fim} (${row.days_count} dias).`,
    dados: {
      pessoa: row.pessoa ?? null,
      inicio,
      fim,
      dias: row.days_count,
      motivo: row.reason ?? null,
      nota: admin_note,
    },
  }
}

async function execute(profile, payload) {
  const { rows: requestRows } = await query(
    'SELECT id, user_id, status FROM vacation_requests WHERE id = $1',
    [payload.id],
  )
  if (!requestRows.length) throw new Error('Não encontrei essa solicitação.')
  const vacationRequest = requestRows[0]
  if (vacationRequest.status !== 'pending') {
    throw new Error('Esta solicitação já foi decidida.')
  }

  const { rows: targetProfileRows } = await query(
    'SELECT role FROM users WHERE id = $1',
    [vacationRequest.user_id],
  )
  if (!targetProfileRows.length) throw new Error('Colaborador não encontrado.')
  recusarSeNaoPode(profile, targetProfileRows[0].role)

  const adminNote = typeof payload?.admin_note === 'string' ? payload.admin_note.trim() || null : payload?.admin_note ?? null
  const decidedAt = new Date().toISOString()
  const { rows } = await query(
    `UPDATE vacation_requests
     SET status = 'approved', admin_note = $1, decided_by = $2, decided_at = $3, updated_at = $3
     WHERE id = $4 AND status = 'pending'
     RETURNING id, user_id, start_date, end_date, days_count, reason, status, admin_note, decided_by, decided_at, created_at, updated_at`,
    [adminNote, profile.id, decidedAt, payload.id],
  )
  if (!rows.length) throw new Error('Esta solicitação já foi decidida.')

  const approved = rows[0]
  const { rows: coversToday } = await query(
    `SELECT 1 FROM vacation_requests
     WHERE id = $1
       AND start_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND end_date   >= (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    [approved.id],
  )
  if (coversToday.length) {
    try {
      await stopRunningTimerForUser(approved.user_id)
    } catch {
      // falha ao encerrar timer não desfaz a aprovação
    }
  }
  return { before: { id: approved.id, status: 'pending' }, after: approved }
}

export default {
  kind: 'write',
  espelha: 'POST /admin/vacation-requests/:id/approve',
  roles: ['admin', 'administrative_intern'],
  definition, propose, execute,
}
