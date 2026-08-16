// Espelha PUT /admin/bonuses/:id (bonuses.js:140, requireAdmin). Carrega a
// linha, faz merge e passa o conjunto completo por parseBonusPayload — a
// rota exige payload completo. Sem id, pede para listar antes.
import { query } from '../../../db.js'
import { parseBonusPayload } from '../../../bonusRequests.js'
import { resolverPessoa } from '../pessoas.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_editar_bonus',
    description:
      'Propõe editar um bônus existente. Requer confirmação. Use o id que veio da listagem de bônus — não invente id. Qualquer subconjunto de pessoa, título, valor, data ou descrição.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do bônus, vindo da listagem' },
        pessoa: { type: 'string', description: 'novo destinatário, pelo nome' },
        titulo: { type: 'string', description: 'novo título' },
        valor: { type: 'number', description: 'novo valor em reais, maior que zero' },
        data: { type: 'string', description: 'nova data YYYY-MM-DD' },
        descricao: { type: 'string', description: 'nova descrição; vazio limpa' },
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

async function carregar(id) {
  if (!id) throw new Error('Informe o id do bônus. Liste os bônus antes.')
  const { rows } = await query(
    `SELECT b.id, b.user_id, b.title, b.description, b.amount, b.bonus_date,
            u.name AS pessoa
       FROM bonuses b
       LEFT JOIN users u ON u.id = b.user_id
      WHERE b.id = $1`,
    [id],
  )
  if (!rows.length) throw new Error('Bônus não encontrado.')
  return rows[0]
}

async function propose(_profile, args) {
  const atual = await carregar(args?.id)
  let userId = atual.user_id
  let pessoaNome = atual.pessoa
  if (args?.pessoa !== undefined) {
    const pessoa = await resolverPessoa(args.pessoa, { acao: 'editar o bônus' })
    userId = pessoa.id
    pessoaNome = pessoa.name
  }

  const parsed = parseBonusPayload({
    user_id: userId,
    title: args?.titulo !== undefined ? args.titulo : atual.title,
    amount: args?.valor !== undefined ? args.valor : atual.amount,
    bonus_date: args?.data !== undefined ? args.data : toISODate(atual.bonus_date),
    description: args?.descricao !== undefined ? args.descricao : atual.description,
  })
  if (parsed.error) throw new Error(parsed.error)

  return {
    kind: 'editar_bonus',
    payload: { id: atual.id, ...parsed.data },
    descricao: `Editar bônus "${parsed.data.title}" de ${pessoaNome || 'colaborador'}.`,
    dados: {
      pessoa: pessoaNome ?? null,
      titulo: parsed.data.title,
      valor: parsed.data.amount,
      data: parsed.data.bonus_date,
      descricao: parsed.data.description,
    },
  }
}

async function execute(_profile, payload) {
  const parsed = parseBonusPayload(payload)
  if (parsed.error) throw new Error(parsed.error)

  const { rows } = await query(
    `UPDATE bonuses
     SET user_id = $1, title = $2, description = $3, amount = $4, bonus_date = $5
     WHERE id = $6
     RETURNING id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at`,
    [parsed.data.user_id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.bonus_date, payload.id],
  )
  if (!rows || rows.length === 0) throw new Error('Bônus não encontrado.')
  return { before: { id: payload.id }, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'PUT /admin/bonuses/:id',
  roles: ['admin'],
  definition,
  propose,
  execute,
}
