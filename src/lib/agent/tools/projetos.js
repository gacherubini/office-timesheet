// Resolução de projeto por NOME, compartilhada pelas tools. O modelo conversa
// em nomes ("projeto Acme"), nunca em uuid: nenhuma tool expõe id de projeto, e
// mandar um nome onde a coluna é uuid faz o Postgres devolver erro cru para
// dentro da conversa. Ambiguidade vira pedido de esclarecimento (§6), não chute.
import { query } from '../../db.js'

// `acao` entra na pergunta de esclarecimento ("...para iniciar o apontamento").
export async function resolverProjeto(nome, { somenteAtivos = false, acao = '' } = {}) {
  const alvo = (nome || '').trim()
  const qualificador = somenteAtivos ? ' ativo' : ''
  if (!alvo) {
    throw new Error(`Qual projeto? Diga o nome do projeto${acao ? ` para ${acao}` : ''}.`)
  }
  const { rows } = await query(
    `SELECT id, name FROM projects
      WHERE deleted_at IS NULL ${somenteAtivos ? `AND status = 'active'` : ''}
        AND name ILIKE $1
      ORDER BY name`,
    [`%${alvo}%`],
  )
  if (rows.length === 0) throw new Error(`Não encontrei um projeto${qualificador} chamado "${alvo}".`)
  if (rows.length > 1) {
    const nomes = rows.map((r) => `"${r.name}"`).join(', ')
    throw new Error(`Há mais de um projeto${qualificador} com esse nome (${nomes}); especifique melhor.`)
  }
  return rows[0]
}
