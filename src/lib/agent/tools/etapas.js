// Resolução de etapa por NOME, irmã de projetos.js/tarefas.js. Etapa é POR
// PROJETO (migration 048): o mesmo nome ("Executivo") existe em várias obras,
// então resolve sempre dentro do `projeto` já resolvido — nunca por uuid cru,
// nunca cruzando projetos. Ambiguidade e nome inexistente viram pedido de
// esclarecimento, no mesmo espírito de resolverPessoa/resolverProjeto.
//
// Sem nome dito: se o projeto tem uma etapa só, usa ela (não há o que
// escolher). Com mais de uma, RECUSA e lista as etapas — não escolhe por
// conta própria: pôr a tarefa na etapa errada é pior que perguntar.
import { query } from '../../db.js'

export async function resolverEtapa(nome, projeto) {
  const alvo = (nome || '').trim()

  if (alvo) {
    const { rows } = await query(
      `SELECT id, name FROM project_stages
        WHERE project_id = $1 AND name ILIKE $2
        ORDER BY name`,
      [projeto.id, `%${alvo}%`],
    )
    if (rows.length === 0) {
      throw new Error(`Não encontrei a etapa "${alvo}" no projeto "${projeto.name}".`)
    }
    if (rows.length > 1) {
      const nomes = rows.map((r) => `"${r.name}"`).join(', ')
      throw new Error(`Há mais de uma etapa chamada "${alvo}" no projeto "${projeto.name}" (${nomes}); especifique melhor.`)
    }
    return rows[0]
  }

  const { rows: todas } = await query(
    `SELECT id, name FROM project_stages WHERE project_id = $1 ORDER BY position, name`,
    [projeto.id],
  )
  if (todas.length === 0) {
    throw new Error(`O projeto "${projeto.name}" ainda não tem etapas cadastradas; crie uma etapa antes de adicionar tarefas.`)
  }
  if (todas.length === 1) return todas[0]

  const nomes = todas.map((r) => `"${r.name}"`).join(', ')
  throw new Error(`O projeto "${projeto.name}" tem mais de uma etapa (${nomes}); diga em qual etapa entra a tarefa.`)
}
