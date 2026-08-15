// Resolução de tarefa por TÍTULO, irmã de projetos.js. O modelo conversa em
// nomes ("tarefa Logo no projeto Acme"), nunca em uuid. Sem ALS e sem 3º arg
// de id: o nome vazio pergunta o título. Ambiguidade vira pedido de
// esclarecimento, não chute.
import { query } from '../../db.js'
import { resolverProjeto } from './projetos.js'

export async function resolverTarefa(nome, { projeto, acao } = {}) {
  const alvo = (nome || '').trim()
  if (!alvo) {
    throw new Error(`Qual tarefa? Diga o título da tarefa${acao ? ` para ${acao}` : ''}.`)
  }

  const conditions = ['t.title ILIKE $1', 'p.deleted_at IS NULL']
  const params = [`%${alvo}%`]
  if ((projeto || '').trim()) {
    const p = await resolverProjeto(projeto, { acao })
    params.push(p.id)
    conditions.push(`t.project_id = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT t.id, t.title, t.project_id, p.name AS project_name, t.status, t.assignee_id
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.title`,
    params,
  )
  if (rows.length === 0) throw new Error(`Não encontrei a tarefa "${alvo}".`)
  if (rows.length > 1) {
    const nomes = rows.map((r) => `"${r.title}" no projeto "${r.project_name}"`).join(', ')
    throw new Error(`Há mais de uma tarefa com esse nome (${nomes}); especifique melhor.`)
  }
  return rows[0]
}
