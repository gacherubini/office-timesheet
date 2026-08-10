// Espelha o alcance de GET /tasks e do detalhe de tarefa (projectManagement.js:80/204,
// requireAuth, sem recorte por papel): o que mexeu num projeto no período —
// comentários novos (task_comments), anexos novos (task_attachments) e atividade
// das tarefas (task_activity, alimentada por logActivity em taskActivity.js:6).
// Três agregações separadas: são tabelas distintas, não um único endpoint.
// O projeto entra por NOME: nenhuma tool expõe uuid, então pedir id aqui deixava
// a tool inalcançável para o modelo.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'
import { resolverProjeto } from '../projetos.js'

const definition = {
  type: 'function',
  function: {
    name: 'andamento_de_projeto',
    description: 'O que mudou num projeto no período: comentários novos, anexos novos e atividade das tarefas (mudanças de status, atribuições). Use para o resumo semanal de um projeto.',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão semana' },
      },
      required: ['projeto'],
      additionalProperties: false,
    },
  },
}

// Quantas atividades a lista de itens traz. A CONTAGEM não sai daqui: é COUNT(*)
// à parte, senão um projeto com 500 eventos reportaria exatamente o teto.
const TETO_ITENS = 20

async function run(_profile, args) {
  const projeto = await resolverProjeto(args?.projeto, { acao: 'ver o andamento' })
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'semana')
  const params = [projeto.id, inicio, fim]
  const janela = `AND x.created_at >= ($2::date AT TIME ZONE 'America/Sao_Paulo')
                  AND x.created_at < (($3::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')`

  const comentarios = await query(
    `SELECT COUNT(*)::int AS n FROM task_comments x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}`,
    params,
  )
  const anexos = await query(
    `SELECT COUNT(*)::int AS n FROM task_attachments x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}`,
    params,
  )
  const atividades = await query(
    `SELECT COUNT(*)::int AS n FROM task_activity x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}`,
    params,
  )
  const ultimas = await query(
    `SELECT x.type AS tipo, t.title AS tarefa, x.created_at AS quando
       FROM task_activity x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}
      ORDER BY x.created_at DESC
      LIMIT ${TETO_ITENS}`,
    params,
  )

  const total = atividades.rows[0].n
  const data = {
    projeto: projeto.name,
    projeto_id: projeto.id,
    periodo: { inicio, fim },
    novos_comentarios: comentarios.rows[0].n,
    novos_anexos: anexos.rows[0].n,
    atividades: total,
    // Deixa explícito que a lista é uma amostra, para o modelo não somar itens
    // e anunciar isso como o total do período.
    itens_truncados: total > ultimas.rows.length,
    ultimas_atividades: ultimas.rows.map((r) => ({ tarefa: r.tarefa, tipo: r.tipo, quando: r.quando })),
  }
  return { data, count: total }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
