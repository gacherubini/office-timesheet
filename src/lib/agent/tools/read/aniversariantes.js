// Espelha GET /me/team-birthdays (me.js, requireAuth): aniversariantes do time,
// dado social aberto a todos os papéis. Só nome + dia/mês + cargo — o ano/idade
// nunca sai (decisão de privacidade). A conta de "quem comemora" vive em
// lib/birthdays.js, a mesma que o endpoint usa. Não passa pelo scope.js: a
// visibilidade aqui é intencionalmente mais ampla e não-sensível.
import { query } from '../../../db.js'
import { dateInSaoPaulo } from '../../../dates.js'
import { aniversariantes as filtrar } from '../../../birthdays.js'

const YM_RE = /^\d{4}-\d{2}$/

const definition = {
  type: 'function',
  function: {
    name: 'aniversariantes',
    description: 'Quem faz aniversário no time. Sem parâmetro, são os de HOJE; com `mes` (YYYY-MM), os do mês inteiro. Retorna nome, dia e mês — nunca o ano. É informação pública do time; qualquer pessoa pode ver.',
    parameters: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'mês no formato YYYY-MM; se omitido, retorna os aniversariantes de hoje' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const mes = YM_RE.test(String(args?.mes || '')) ? Number(String(args.mes).slice(5, 7)) : null
  const hoje = dateInSaoPaulo()
  const { rows } = await query(
    `SELECT name, position, birth_date
       FROM users
      WHERE deleted_at IS NULL AND is_active = true AND birth_date IS NOT NULL`,
  )
  const data = filtrar(rows, { hoje, mes })
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /me/team-birthdays',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
