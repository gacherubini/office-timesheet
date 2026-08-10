// Espelha POST /me/vacation-requests (vacations.js:176, requireAuth, todos os
// papéis): pede férias PARA SI. As regras de data e a checagem de sobreposição
// vêm de lib/vacationRequests.js — as mesmas que a rota usa, não uma cópia. O
// auto-aprovar do admin também é espelhado: quem tem o direito na rota tem aqui.
import { query } from '../../../db.js'
import { parseVacationPayload, hasOverlappingVacation } from '../../../vacationRequests.js'
import { canAutoApproveOwnVacationRequest } from '../../../permissions.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_pedir_ferias',
    description: 'Propõe uma solicitação de férias do próprio usuário. Requer confirmação. As datas são inclusivas e não podem começar no passado nem se sobrepor a um pedido pendente ou aprovado.',
    parameters: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'primeiro dia de férias, no formato YYYY-MM-DD' },
        fim: { type: 'string', description: 'último dia de férias (inclusivo), no formato YYYY-MM-DD' },
        motivo: { type: 'string', description: 'motivo, opcional' },
      },
      required: ['inicio', 'fim'],
      additionalProperties: false,
    },
  },
}

// A rota devolve {error} em vez de lançar; aqui o erro precisa virar Error para
// o loop.js entregar a mensagem ao modelo como erro de tool.
function validar(args) {
  const parsed = parseVacationPayload({
    start_date: args?.inicio,
    end_date: args?.fim,
    reason: args?.motivo,
  })
  if (parsed.error) throw new Error(parsed.error)
  return parsed.data
}

async function propose(profile, args) {
  const dados = validar(args)
  if (await hasOverlappingVacation(profile.id, dados.start_date, dados.end_date)) {
    throw new Error('Já existe uma solicitação de férias pendente ou aprovada nesse período.')
  }
  return {
    kind: 'pedir_ferias',
    payload: dados,
    descricao: `Pedir férias de ${dados.start_date} a ${dados.end_date} (${dados.days_count} dias).`,
    dados,
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO: outro pedido pode ter entrado entre propor e aprovar.
  if (await hasOverlappingVacation(profile.id, payload.start_date, payload.end_date)) {
    throw new Error('Já existe uma solicitação de férias pendente ou aprovada nesse período.')
  }
  const autoAprova = canAutoApproveOwnVacationRequest(profile)
  const decidedAt = autoAprova ? new Date().toISOString() : null

  const { rows } = await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, reason, status, decided_by, decided_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, user_id, start_date, end_date, days_count, reason, status, decided_at, created_at`,
    [
      profile.id,
      payload.start_date,
      payload.end_date,
      payload.days_count,
      payload.reason ?? null,
      autoAprova ? 'approved' : 'pending',
      autoAprova ? profile.id : null,
      decidedAt,
      decidedAt || new Date().toISOString(),
    ],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /me/vacation-requests',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
