// Regras de uma solicitação de férias, fora da rota porque têm dois leitores: o
// POST /me/vacation-requests e a tool propor_pedir_ferias do agente. Duas cópias
// divergiriam na primeira mudança, e o agente passaria a propor o que a rota
// recusa (ou vice-versa).
import { query } from './db.js'

export const ACTIVE_VACATION_STATUSES = ['pending', 'approved']

// parseDateOnly também alimenta GET /vacation-calendar (mesmo formato de data).
export function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const utcTime = Date.UTC(year, month - 1, day)
  const date = new Date(utcTime)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { value, utcTime }
}

function todayValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateInclusiveDays(startUtcTime, endUtcTime) {
  return Math.round((endUtcTime - startUtcTime) / 86400000) + 1
}

export function parseVacationPayload(body) {
  const startDate = parseDateOnly(body.start_date)
  const endDate = parseDateOnly(body.end_date)
  const reason = body.reason?.trim() || null

  if (!startDate) return { error: 'Data de início inválida.' }
  if (!endDate) return { error: 'Data de fim inválida.' }
  if (endDate.utcTime < startDate.utcTime) {
    return { error: 'Data de fim deve ser igual ou posterior ao início.' }
  }
  if (startDate.value < todayValue()) {
    return { error: 'Solicitações de férias não podem começar no passado.' }
  }

  return {
    data: {
      start_date: startDate.value,
      end_date: endDate.value,
      days_count: calculateInclusiveDays(startDate.utcTime, endDate.utcTime),
      reason,
    },
  }
}

export async function hasOverlappingVacation(userId, startDate, endDate) {
  const { rows } = await query(
    `SELECT id FROM vacation_requests
      WHERE user_id = $1
        AND status = ANY($2)
        AND daterange(start_date::date, end_date::date, '[]') && daterange($3::date, $4::date, '[]')
      LIMIT 1`,
    [userId, ACTIVE_VACATION_STATUSES, startDate, endDate],
  )
  return rows.length > 0
}
