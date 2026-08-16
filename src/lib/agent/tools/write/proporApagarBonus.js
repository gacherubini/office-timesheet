// Espelha DELETE /admin/bonuses/:id (bonuses.js:164, requireAdmin). Hard
// delete, sem lixeira. propose carrega o snapshot; execute DELETE RETURNING.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_apagar_bonus',
    description:
      'Propõe apagar um bônus. Requer confirmação. Use o id que veio da listagem de bônus — não invente id. Hard delete, sem lixeira.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do bônus, vindo da listagem' },
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
  const row = await carregar(args?.id)
  const valor = Number(row.amount)
  return {
    kind: 'apagar_bonus',
    payload: { id: row.id },
    descricao: `Apagar bônus "${row.title}" de ${row.pessoa || 'colaborador'}.`,
    dados: {
      pessoa: row.pessoa ?? null,
      titulo: row.title,
      valor,
      data: toISODate(row.bonus_date),
    },
  }
}

async function execute(_profile, payload) {
  const { rows } = await query('DELETE FROM bonuses WHERE id = $1 RETURNING id', [payload.id])
  if (!rows || rows.length === 0) throw new Error('Bônus não encontrado.')
  return { before: { id: payload.id }, after: null }
}

export default {
  kind: 'write',
  espelha: 'DELETE /admin/bonuses/:id',
  roles: ['admin'],
  definition,
  propose,
  execute,
}
