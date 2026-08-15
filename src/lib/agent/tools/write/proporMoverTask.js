// Espelha PUT /tasks/:id/status (requireAuth, qualquer logado): move a tarefa
// de coluna. Sem position — a rota defaulta 0; o agente não reordena o kanban.
import { query } from '../../../db.js'
import { logActivity } from '../../../taskActivity.js'
import { resolverTarefa } from '../tarefas.js'

const VALID = ['todo', 'in_progress', 'in_review', 'done', 'abandoned']

const definition = {
  type: 'function',
  function: {
    name: 'propor_mover_task',
    description: 'Propõe mover uma tarefa de coluna no kanban. Requer confirmação. Status: todo, in_progress, in_review, done ou abandoned.',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto (opcional, para desambiguar a tarefa)' },
        tarefa: { type: 'string', description: 'título da tarefa' },
        status: { type: 'string', enum: VALID, description: 'coluna de destino' },
      },
      required: ['tarefa', 'status'],
      additionalProperties: false,
    },
  },
}

async function propose(_profile, args) {
  const status = args?.status
  if (!VALID.includes(status)) {
    throw new Error('status inválido. Use todo, in_progress, in_review, done ou abandoned.')
  }
  const tarefa = await resolverTarefa(args?.tarefa, { projeto: args?.projeto, acao: 'mover a tarefa' })
  return {
    kind: 'mover_task',
    payload: { task_id: tarefa.id, status },
    descricao: `Mover a tarefa "${tarefa.title}" de ${tarefa.status} para ${status}.`,
    dados: { projeto: tarefa.project_name, tarefa: tarefa.title, de: tarefa.status, para: status },
  }
}

async function execute(profile, payload) {
  const { rows: taskRows } = await query(
    'SELECT project_id, assignee_id, status FROM tasks WHERE id = $1',
    [payload.task_id],
  )
  if (taskRows.length === 0) throw new Error('A tarefa não existe mais.')
  const task = taskRows[0]
  const status = payload.status

  // Mesmo UPDATE da rota, position fixo em 0 (default quando a rota não recebe inteiro).
  const { rows } = await query(
    `UPDATE tasks
     SET status = $1::task_status,
         position = $2,
         completed_at = CASE WHEN $1::task_status = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END
     WHERE id = $3
     RETURNING id, project_id, title, description, status, assignee_id, due_date, position, priority, completed_at, created_at, updated_at`,
    [status, 0, payload.task_id],
  )

  if (status !== task.status) {
    await logActivity(payload.task_id, profile.id, 'status_changed', { from: task.status, to: status })
  }

  return { before: { id: payload.task_id, status: task.status }, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'PUT /tasks/:id/status',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
