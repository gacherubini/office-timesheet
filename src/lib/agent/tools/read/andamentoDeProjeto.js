// Espelha o alcance de GET /tasks e do detalhe de tarefa (projectManagement.js:80/204,
// requireAuth, sem recorte por papel): o que mexeu num projeto no período —
// comentários novos (task_comments), anexos novos (task_attachments) e atividade
// das tarefas (task_activity, alimentada por logActivity em taskActivity.js:6).
// Três agregações separadas: são tabelas distintas, não um único endpoint.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'andamento_de_projeto',
    description: 'O que mudou num projeto no período: comentários novos, anexos novos e atividade das tarefas (mudanças de status, atribuições). Use para o resumo semanal de um projeto.',
    parameters: {
      type: 'object',
      properties: {
        projeto_id: { type: 'string', description: 'id do projeto' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão semana' },
      },
      required: ['projeto_id'],
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  const projetoId = args?.projeto_id
  if (!projetoId) return { data: null, count: 0 }
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'semana')
  const params = [projetoId, inicio, fim]
  const janela = `AND x.created_at >= $2::date AND x.created_at < ($3::date + interval '1 day')`

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
  const atividade = await query(
    `SELECT x.type AS tipo, t.title AS tarefa, x.created_at AS quando
       FROM task_activity x
       JOIN tasks t ON t.id = x.task_id
      WHERE t.project_id = $1 ${janela}
      ORDER BY x.created_at DESC
      LIMIT 20`,
    params,
  )

  const data = {
    projeto_id: projetoId,
    periodo: { inicio, fim },
    novos_comentarios: comentarios.rows[0].n,
    novos_anexos: anexos.rows[0].n,
    atividades: atividade.rows.length,
    itens: atividade.rows.map((r) => ({ tarefa: r.tarefa, tipo: r.tipo, quando: r.quando })),
  }
  return { data, count: atividade.rows.length }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
