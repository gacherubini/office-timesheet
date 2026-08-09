// Espelha POST /projects/:id/tasks (requireAuth, "liberado a qualquer usuário
// logado"): abre uma tarefa num projeto. propose valida como a rota (título
// obrigatório, prioridade low/medium/high) e resolve o projeto pelo nome;
// execute revalida que o projeto existe, calcula a position no fim da coluna
// 'todo' e insere com created_by do próprio usuário. Nada de novo é liberado.
import { query } from '../../../db.js'

const PRIORIDADES = ['low', 'medium', 'high']

const definition = {
  type: 'function',
  function: {
    name: 'propor_criar_task',
    description: 'Propõe criar uma tarefa num projeto (entra na coluna "a fazer"). Requer confirmação. Prioridade opcional: low, medium ou high (padrão medium).',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto onde criar a tarefa' },
        titulo: { type: 'string', description: 'título da tarefa' },
        prioridade: { type: 'string', enum: PRIORIDADES, description: 'prioridade; padrão medium' },
      },
      required: ['projeto', 'titulo'],
      additionalProperties: false,
    },
  },
}

// Resolve um projeto pelo nome (sem filtrar por status — a rota não filtra).
async function resolverProjeto(nome) {
  const alvo = (nome || '').trim()
  if (!alvo) throw new Error('Em qual projeto? Diga o nome do projeto para criar a tarefa.')
  const { rows } = await query(
    `SELECT id, name FROM projects WHERE deleted_at IS NULL AND name ILIKE $1 ORDER BY name`,
    [`%${alvo}%`],
  )
  if (rows.length === 0) throw new Error(`Não encontrei um projeto chamado "${alvo}".`)
  if (rows.length > 1) throw new Error(`Há mais de um projeto com esse nome; especifique melhor "${alvo}".`)
  return rows[0]
}

async function propose(profile, args) {
  const titulo = (args?.titulo || '').trim()
  if (!titulo) throw new Error('Qual o título da tarefa?')
  const prioridade = args?.prioridade
  if (prioridade !== undefined && !PRIORIDADES.includes(prioridade)) {
    throw new Error('Prioridade inválida. Use low, medium ou high.')
  }
  const projeto = await resolverProjeto(args?.projeto)
  const priority = prioridade || 'medium'
  return {
    kind: 'criar_task',
    payload: { project_id: projeto.id, title: titulo, priority },
    descricao: `Criar a tarefa "${titulo}" (prioridade ${priority}) no projeto "${projeto.name}".`,
    dados: { project_id: projeto.id, projeto: projeto.name, titulo, prioridade: priority },
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO: o projeto ainda existe? (pode ter sido removido).
  const { rows: existe } = await query(
    'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL',
    [payload.project_id],
  )
  if (existe.length === 0) throw new Error('O projeto não existe mais.')

  // position = fim da coluna 'todo' — mesmo cálculo do endpoint.
  const { rows: posRows } = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM tasks WHERE project_id = $1 AND status = 'todo'`,
    [payload.project_id],
  )
  const position = posRows[0].next

  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, priority, position, created_by)
     VALUES ($1, $2, $3::task_priority, $4, $5)
     RETURNING id, project_id, title, status, priority, position, created_by, created_at`,
    [payload.project_id, payload.title, payload.priority, position, profile.id],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /projects/:id/tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
