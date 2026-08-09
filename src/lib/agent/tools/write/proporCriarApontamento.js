// Espelha POST /time-entries/start (requireAuth, todos os papéis): inicia o
// PRÓPRIO apontamento. propose só descreve; execute revalida e insere. As duas
// guardas de estado do endpoint são replicadas: (1) o índice único
// one_open_entry_per_user impede segundo apontamento aberto; (2)
// blockTimerDuringVacation impede iniciar durante férias aprovadas de hoje.
// Nada de novo é liberado — a rota já permite isto a qualquer autenticado.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_criar_apontamento',
    description: 'Propõe iniciar um novo apontamento (timer) do próprio usuário num projeto. Requer confirmação. Não pode haver outro apontamento aberto nem férias aprovadas hoje.',
    parameters: {
      type: 'object',
      properties: { projeto: { type: 'string', description: 'nome do projeto ativo onde iniciar o timer' } },
      required: ['projeto'],
      additionalProperties: false,
    },
  },
}

// Resolve um projeto ATIVO pelo nome (substring). Erros viram pedido de esclarecimento (§6).
async function resolverProjeto(nome) {
  const alvo = (nome || '').trim()
  if (!alvo) throw new Error('Qual projeto? Diga o nome do projeto para iniciar o apontamento.')
  const { rows } = await query(
    `SELECT id, name FROM projects WHERE status = 'active' AND deleted_at IS NULL AND name ILIKE $1 ORDER BY name`,
    [`%${alvo}%`],
  )
  if (rows.length === 0) throw new Error(`Não encontrei um projeto ativo chamado "${alvo}".`)
  if (rows.length > 1) throw new Error(`Há mais de um projeto ativo com esse nome; especifique melhor "${alvo}".`)
  return rows[0]
}

async function temApontamentoAberto(userId) {
  const { rows } = await query(
    `SELECT 1 FROM time_entries WHERE user_id = $1 AND status IN ('running','paused') LIMIT 1`,
    [userId],
  )
  return rows.length > 0
}

// Férias aprovadas cobrindo HOJE no fuso do estúdio (mesma regra do endpoint).
async function deFeriasHoje(userId) {
  const { rows } = await query(
    `SELECT 1 FROM vacation_requests
      WHERE user_id = $1 AND status = 'approved'
        AND start_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND end_date   >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      LIMIT 1`,
    [userId],
  )
  return rows.length > 0
}

async function propose(profile, args) {
  const projeto = await resolverProjeto(args?.projeto)
  if (await temApontamentoAberto(profile.id)) {
    throw new Error('Você já tem um apontamento aberto. Encerre o atual antes de iniciar outro.')
  }
  if (await deFeriasHoje(profile.id)) {
    throw new Error('Você está de férias aprovadas hoje; o timer fica bloqueado.')
  }
  return {
    kind: 'criar_apontamento',
    payload: { project_id: projeto.id },
    descricao: `Iniciar um apontamento no projeto "${projeto.name}" agora.`,
    dados: { project_id: projeto.id, projeto: projeto.name },
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO (pode ter mudado entre propor e aprovar). Não há papel a
  // re-checar: a rota espelhada é requireAuth para todos os papéis.
  if (await temApontamentoAberto(profile.id)) {
    throw new Error('Você já tem um apontamento aberto. Encerre o atual antes de iniciar outro.')
  }
  if (await deFeriasHoje(profile.id)) {
    throw new Error('Você está de férias aprovadas hoje; o timer fica bloqueado.')
  }
  try {
    const { rows } = await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now(), 'running')
       RETURNING id, user_id, project_id, started_at, status`,
      [profile.id, payload.project_id],
    )
    return { before: { aberto: false }, after: rows[0] }
  } catch (err) {
    // Backstop do índice único parcial one_open_entry_per_user.
    if (err.code === '23505') throw new Error('Você já tem um apontamento aberto.')
    throw err
  }
}

export default {
  kind: 'write',
  espelha: 'POST /time-entries/start',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
