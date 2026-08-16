// Espelha POST /time-entries/stop (requireAuth): encerra o PRÓPRIO apontamento
// aberto. propose só descreve; execute revalida e encerra. Mesmo cálculo do
// route (duração líquida de pausas + cost_snapshot do hourly_rate).
import { query } from '../../../db.js'
import { notifyAdmins } from '../../../notificationsHub.js'
import { stopRunningEntry } from '../../../stopTimer.js'
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
  const { rows: atual } = await query(
    `SELECT id FROM time_entries
      WHERE id = $1 AND user_id = $2 AND status = 'running'`,
    [payload.entry_id, profile.id],
  )
  if (atual.length === 0) throw new Error('O apontamento não está mais aberto ou não é seu.')

  const result = await stopRunningEntry(profile.id)
  if (result.notFound || result.entry.id !== payload.entry_id) {
    throw new Error('O apontamento não está mais aberto ou não é seu.')
  }

  await notifyAdmins({ type: 'time_entry_stopped', projectId: result.projectId, actorId: profile.id })
  return { before: { id: payload.entry_id, status: 'running' }, after: result.entry }
}

export default {
  kind: 'write',
  espelha: 'POST /time-entries/stop',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
