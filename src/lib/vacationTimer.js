import { query } from './db.js'

// Se a férias aprovada cobre "hoje" SP, encerra timer aberto do colaborador
// (blockTimerDuringVacation só age em start/resume). Extraído de
// routes/vacations.js para a rota e a tool de aprovar férias usarem o mesmo.
export async function stopRunningTimerForUser(userId) {
  const { rows: openEntries } = await query(
    `SELECT te.id, te.started_at, u.hourly_rate
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     WHERE te.user_id = $1 AND te.status = 'running'
     LIMIT 1`,
    [userId]
  )
  if (!openEntries.length) return

  const entry = openEntries[0]
  const { rows: nowRows } = await query('SELECT now() AS stop_ts')
  const stopTs = nowRows[0].stop_ts

  await query(
    `UPDATE time_entry_pauses SET resumed_at = $1
     WHERE time_entry_id = $2 AND resumed_at IS NULL`,
    [stopTs, entry.id]
  )

  const { rows: pauses } = await query(
    `SELECT paused_at, resumed_at FROM time_entry_pauses WHERE time_entry_id = $1`,
    [entry.id]
  )

  const startDate = new Date(entry.started_at)
  const endDate = new Date(stopTs)
  let pausedMs = 0
  for (const p of pauses) {
    const a = new Date(p.paused_at)
    const b = p.resumed_at ? new Date(p.resumed_at) : endDate
    pausedMs += Math.max(0, b.getTime() - a.getTime())
  }
  const durationMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime() - pausedMs) / 60000))
  const costSnapshot = Number(((durationMinutes / 60) * (Number(entry.hourly_rate) || 0)).toFixed(2))

  await query(
    `UPDATE time_entries
     SET status = 'completed', ended_at = $1, duration_minutes = $2, cost_snapshot = $3
     WHERE id = $4 AND status = 'running'`,
    [stopTs, durationMinutes, costSnapshot, entry.id]
  )
}
