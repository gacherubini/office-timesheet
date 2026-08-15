// Resolução de pessoa por NOME. Soft-deleted e inativos não são atribuíveis.
// Mesmo espírito de resolverProjeto: vazio pergunta o nome; 0/2+ esclarece.
import { query } from '../../db.js'

export async function resolverPessoa(nome, { acao } = {}) {
  const alvo = (nome || '').trim()
  if (!alvo) {
    throw new Error(`Qual pessoa? Diga o nome${acao ? ` para ${acao}` : ''}.`)
  }
  const { rows } = await query(
    `SELECT id, name FROM users
      WHERE deleted_at IS NULL AND is_active = true
        AND name ILIKE $1
      ORDER BY name`,
    [`%${alvo}%`],
  )
  if (rows.length === 0) throw new Error(`Não encontrei alguém chamado "${alvo}".`)
  if (rows.length > 1) {
    const nomes = rows.map((r) => `"${r.name}"`).join(', ')
    throw new Error(`Há mais de uma pessoa com esse nome (${nomes}); especifique melhor.`)
  }
  return rows[0]
}
