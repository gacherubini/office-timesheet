// Espelha GET /users (users.js:108, requireOperationalAccess). O recorte de
// coluna por papel vem do scope.js — a mesma regra do endpoint, num lugar só.
import { query } from '../../../db.js'
import { colunasVisiveis, linhasVisiveis } from '../../scope.js'

const definition = {
  type: 'function',
  function: {
    name: 'listar_equipe',
    description: 'Lista as pessoas da equipe (nome, papel, cargo e, para quem tem acesso, valor/hora). Use para perguntas sobre quem é quem no time.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}

async function run(profile, _args) {
  const cols = colunasVisiveis(profile, 'users')
  if (cols.length === 0) return { data: [], count: 0 }
  const { where, params } = linhasVisiveis(profile, 'users')
  const { rows } = await query(
    `SELECT ${cols.join(', ')} FROM users WHERE ${where} ORDER BY created_at DESC`,
    params,
  )
  return { data: rows, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /admin/users',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
