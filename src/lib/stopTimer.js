// Encerra o apontamento aberto de um usuário: um relógio do banco, fecha
// pausa, duração líquida, cost_snapshot. Usado pelo POST /stop, pelo agente
// e pela aprovação de férias — o mesmo cálculo, sem caminho paralelo.
import { withTransaction } from './db.js'
import { calculateDurationMinutes, calculateCostSnapshot } from './timeMath.js'

export async function stopRunningEntry(userId) {
  return withTransaction(async (client) => {
    const { rows: openEntries } = await client.query(
      `SELECT te.id, te.started_at, te.project_id, u.hourly_rate
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
        WHERE te.user_id = $1 AND te.status = 'running'
        FOR UPDATE OF te
        LIMIT 1`,
      [userId],
    )
    if (!openEntries.length) return { notFound: true }

    const entry = openEntries[0]
    const { rows: nowRows } = await client.query('SELECT now() AS stop_ts')
    const stopTs = nowRows[0].stop_ts

    await client.query(
      `UPDATE time_entry_pauses
          SET resumed_at = $1
        WHERE time_entry_id = $2 AND resumed_at IS NULL`,
      [stopTs, entry.id],
    )

    const { rows: pausesData } = await client.query(
      `SELECT paused_at, resumed_at FROM time_entry_pauses
        WHERE time_entry_id = $1
        ORDER BY paused_at`,
      [entry.id],
    )

    const startDate = new Date(entry.started_at)
    const endDate = new Date(stopTs)
    let totalPausedMs = 0
    for (const pause of pausesData) {
      const pausedTime = new Date(pause.paused_at)
      const resumedTime = pause.resumed_at ? new Date(pause.resumed_at) : endDate
      totalPausedMs += Math.max(0, resumedTime.getTime() - pausedTime.getTime())
    }

    const durationMs = endDate.getTime() - startDate.getTime() - totalPausedMs
    const durationMinutes = calculateDurationMinutes(new Date(0), new Date(durationMs))
    const costSnapshot = calculateCostSnapshot(durationMinutes, entry.hourly_rate)

    const { rows } = await client.query(
      `UPDATE time_entries
          SET status = 'completed',
              ended_at = $1,
              duration_minutes = $2,
              cost_snapshot = $3
        WHERE id = $4 AND status = 'running'
        RETURNING id, status, duration_minutes, cost_snapshot, ended_at, project_id`,
      [stopTs, durationMinutes, costSnapshot, entry.id],
    )
    if (!rows.length) return { notFound: true }
    return { entry: rows[0], projectId: entry.project_id }
  })
}

// Aprovação de férias: encerra o timer sem notificar de novo (a aprovação
// já gera o próprio recado). Sem apontamento aberto → no-op.
export async function stopRunningTimerForUser(userId) {
  const result = await stopRunningEntry(userId)
  return result.notFound ? null : result.entry
}
