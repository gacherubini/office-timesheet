// Espelha POST /projects/:id/tasks (requireAuth, "liberado a qualquer usuário
// logado"): abre uma tarefa num projeto. propose valida como a rota (título
// obrigatório, prioridade low/medium/high) e resolve o projeto pelo nome;
// execute revalida que o projeto existe, calcula a position no fim da coluna
// 'todo' e insere com created_by do próprio usuário. Nada de novo é liberado.
//
// Toda tarefa pertence a uma etapa (item 8 do PDF de 18/08/2026; a rota exige
// stage_id e devolve 400 sem ele) — resolverEtapa cobre os mesmos quatro
// caminhos que a pessoa teria na tela: etapa dita resolve por NOME dentro do
// projeto (a etapa é por obra, o mesmo nome existe em vários projetos);
// faltando o nome, uma etapa só é usada direto e mais de uma faz a tool
// RECUSAR e listar as opções — nunca chuta em qual etapa a tarefa entra.
import { query } from '../../../db.js'
import { logActivity } from '../../../taskActivity.js'
import { resolverProjeto } from '../projetos.js'
import { resolverEtapa } from '../etapas.js'

const PRIORIDADES = ['low', 'medium', 'high']

const definition = {
  type: 'function',
  function: {
    name: 'propor_criar_task',
    description: 'Propõe criar uma tarefa numa etapa de um projeto (entra na coluna "a fazer"). Requer confirmação. Toda tarefa pertence a uma etapa: se o projeto tiver só uma, é usada automaticamente; se tiver mais de uma, informe qual (etapa). Prioridade opcional: low, medium ou high (padrão medium).',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto onde criar a tarefa' },
        titulo: { type: 'string', description: 'título da tarefa' },
        etapa: { type: 'string', description: 'nome da etapa (dentro do projeto) onde a tarefa entra; opcional se o projeto tiver só uma etapa' },
        prioridade: { type: 'string', enum: PRIORIDADES, description: 'prioridade; padrão medium' },
      },
      required: ['projeto', 'titulo'],
      additionalProperties: false,
    },
  },
}

async function propose(profile, args) {
  const titulo = (args?.titulo || '').trim()
  if (!titulo) throw new Error('Qual o título da tarefa?')
  const prioridade = args?.prioridade
  if (prioridade !== undefined && !PRIORIDADES.includes(prioridade)) {
    throw new Error('Prioridade inválida. Use low, medium ou high.')
  }
  // Sem filtro de status: a rota espelhada também não filtra.
  const projeto = await resolverProjeto(args?.projeto, { acao: 'criar a tarefa' })
  const etapa = await resolverEtapa(args?.etapa, projeto)
  const priority = prioridade || 'medium'
  return {
    kind: 'criar_task',
    payload: { project_id: projeto.id, stage_id: etapa.id, title: titulo, priority },
    descricao: `Criar a tarefa "${titulo}" (prioridade ${priority}) na etapa "${etapa.name}" do projeto "${projeto.name}".`,
    dados: { project_id: projeto.id, stage_id: etapa.id, projeto: projeto.name, etapa: etapa.name, titulo, prioridade: priority },
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO: o projeto ainda existe? (pode ter sido removido).
  const { rows: existe } = await query(
    'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
    [payload.project_id],
  )
  if (existe.length === 0) throw new Error('O projeto não existe mais.')

  // E a etapa? Pode ter sido excluída entre a proposta e a confirmação.
  const { rows: etapaExiste } = await query(
    'SELECT 1 FROM project_stages WHERE id = $1 AND project_id = $2',
    [payload.stage_id, payload.project_id],
  )
  if (etapaExiste.length === 0) throw new Error('A etapa não existe mais neste projeto.')

  // position = fim da coluna 'todo' — mesmo cálculo do endpoint.
  const { rows: posRows } = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks WHERE project_id = $1 AND status = 'todo'`,
    [payload.project_id],
  )
  const position = posRows[0].next

  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, priority, position, stage_id, created_by)
     VALUES ($1, $2, $3::task_priority, $4, $5, $6)
     RETURNING id, project_id, title, status, priority, position, stage_id, created_by, created_at`,
    [payload.project_id, payload.title, payload.priority, position, payload.stage_id, profile.id],
  )
  // Mesmo registro de histórico que a rota faz (projectManagement.js:60). Sem
  // isto a tarefa nasce sem 'created' em task_activity e some do andamento do
  // projeto — que é justamente a tabela que andamento_de_projeto lê.
  await logActivity(rows[0].id, profile.id, 'created', { title: rows[0].title })
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /projects/:id/tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
