// Espelha POST /admin/bonuses (bonuses.js:112, requireAdmin). Intern fora.
// Propõe lançar bônus para uma pessoa pelo nome. propose não grava.
import { query } from '../../../db.js'
import { parseBonusPayload } from '../../../bonusRequests.js'
import { formatDateBR } from '../../format.js'
import { resolverPessoa } from '../pessoas.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_lancar_bonus',
    description:
      'Propõe lançar um bônus para uma pessoa. Requer confirmação. Pessoa pelo nome; título, valor (> 0) e data obrigatórios. Descrição opcional. '
      + 'NUNCA assuma a data: bônus é lançado retroativo com frequência, e a data define a competência do pagamento. '
      + 'Se a pessoa não disse a data, PERGUNTE antes de chamar esta ferramenta — não chame com a data de hoje por padrão.',
    parameters: {
      type: 'object',
      properties: {
        pessoa: { type: 'string', description: 'nome da pessoa que recebe o bônus' },
        titulo: { type: 'string', description: 'título do bônus' },
        valor: { type: 'number', description: 'valor em reais, maior que zero; converta "R$ 800,00" para 800' },
        data: { type: 'string', description: 'data do bônus informada pela pessoa, no formato YYYY-MM-DD. Não invente nem use hoje como padrão — se não foi dita, pergunte.' },
        descricao: { type: 'string', description: 'descrição, opcional' },
      },
      required: ['pessoa', 'titulo', 'valor', 'data'],
      additionalProperties: false,
    },
  },
}

function validar(args, userId) {
  const parsed = parseBonusPayload({
    user_id: userId,
    title: args?.titulo,
    amount: args?.valor,
    bonus_date: args?.data,
    description: args?.descricao,
  })
  if (parsed.error) throw new Error(parsed.error)
  return parsed.data
}

async function propose(_profile, args) {
  const pessoa = await resolverPessoa(args?.pessoa, { acao: 'lançar o bônus' })
  const dadosNegocio = validar(args, pessoa.id)
  return {
    kind: 'lancar_bonus',
    payload: dadosNegocio,
    // Data em DD/MM/AAAA: o card de confirmação é a última chance de pegar
    // competência errada, e ninguém confere ISO de relance.
    descricao: `Lançar bônus "${dadosNegocio.title}" de ${dadosNegocio.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para ${pessoa.name} em ${formatDateBR(dadosNegocio.bonus_date)}.`,
    dados: {
      pessoa: pessoa.name,
      titulo: dadosNegocio.title,
      valor: dadosNegocio.amount,
      data: dadosNegocio.bonus_date,
      descricao: dadosNegocio.description,
    },
  }
}

async function execute(profile, payload) {
  const parsed = parseBonusPayload(payload)
  if (parsed.error) throw new Error(parsed.error)

  const { rows: targetProfileRows } = await query(
    'SELECT id FROM users WHERE id = $1',
    [parsed.data.user_id],
  )
  if (!targetProfileRows || targetProfileRows.length === 0) {
    throw new Error('Colaborador não encontrado.')
  }

  const { rows } = await query(
    `INSERT INTO bonuses (user_id, title, description, amount, bonus_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, title, description, amount, bonus_date, created_by, created_at, updated_at`,
    [parsed.data.user_id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.bonus_date, profile.id],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /admin/bonuses',
  roles: ['admin'],
  definition,
  propose,
  execute,
}
