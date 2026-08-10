// Espelha POST /time-entries/stop (requireAuth): encerra o PRÓPRIO apontamento
// aberto. propose só descreve; execute revalida e encerra. Mesmo cálculo do
// route (duração líquida de pausas + cost_snapshot do hourly_rate).
import { query } from '../../../db.js'
import { notifyAdmins } from '../../../notificationsHub.js'
import { calculateDurationMinutes, calculateCostSnapshot } from '../../../timeMath.js'
import { formatDateBR } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_encerrar_apontamento',
    description: 'Propõe encerrar o apontamento (timer) que o próprio usuário tem em aberto agora. Requer confirmação.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}

async function apontamentoAberto(userId) {
  const { rows } = await query(
    `SELECT te.id, te.project_id, te.started_at, p.name AS project_name
       FROM time_entries te LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.user_id = $1 AND te.status = 'running' LIMIT 1`,
    [userId],
  )
  return rows[0] || null
}

async function propose(profile, _args) {
  const aberto = await apontamentoAberto(profile.id)
  if (!aberto) throw new Error('Você não tem nenhum apontamento aberto para encerrar.')
  return {
    kind: 'encerrar_apontamento',
    payload: { entry_id: aberto.id },
    descricao: `Encerrar o apontamento no projeto "${aberto.project_name}", aberto desde ${formatDateBR(aberto.started_at)}.`,
    dados: { entry_id: aberto.id, projeto: aberto.project_name, started_at: aberto.started_at },
  }
}

async function execute(profile, payload) {
  // Revalida: ainda em aberto E ainda do próprio usuário (pode ter mudado entre
  // propor e aprovar). Sem isso, uma proposta velha encerraria o que não devia.
  const { rows: atual } = await query(
    `SELECT id, started_at, status, project_id FROM time_entries
      WHERE id = $1 AND user_id = $2 AND status = 'running'`,
    [payload.entry_id, profile.id],
  )
  if (atual.length === 0) throw new Error('O apontamento não está mais aberto ou não é seu.')
  const entry = atual[0]

  const { rows: pauses } = await query(
    `SELECT paused_at, resumed_at FROM time_entry_pauses WHERE time_entry_id = $1 ORDER BY paused_at`,
    [entry.id],
  )
  const now = new Date()
  let pausedMs = 0
  for (const pause of pauses) {
    const ini = new Date(pause.paused_at)
    const fim = pause.resumed_at ? new Date(pause.resumed_at) : now
    pausedMs += Math.max(0, fim.getTime() - ini.getTime())
  }
  const durationMs = now.getTime() - new Date(entry.started_at).getTime() - pausedMs
  const durationMinutes = calculateDurationMinutes(new Date(0), new Date(durationMs))

  const { rows: rates } = await query('SELECT hourly_rate FROM users WHERE id = $1', [profile.id])
  const costSnapshot = calculateCostSnapshot(durationMinutes, rates?.[0]?.hourly_rate || 0)

  const { rows: after } = await query(
    `UPDATE time_entries SET status = 'completed', ended_at = now(),
            duration_minutes = $1, cost_snapshot = $2
      WHERE id = $3 RETURNING id, status, duration_minutes, cost_snapshot`,
    [durationMinutes, costSnapshot, entry.id],
  )
  // Paridade de comportamento com POST /time-entries/stop (§8.3): a rota notifica
  // os admins ao encerrar; o canal do agente faz o mesmo.
  await notifyAdmins({ type: 'time_entry_stopped', projectId: entry.project_id, actorId: profile.id })
  return { before: { id: entry.id, status: 'running' }, after: after[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /time-entries/stop',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
