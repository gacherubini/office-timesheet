// Espelha POST /tasks/:id/comments (requireAuth, qualquer logado): comenta
// numa tarefa pelo título. Sem menção e sem anexo — a rota aceita body vazio
// quando há arquivo; o agente exige texto. propose não grava.
import { query } from '../../../db.js'
import { inserirComentario } from '../../../taskComments.js'
import { resolverTarefa } from '../tarefas.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_comentar_task',
    description: 'Propõe um comentário de texto numa tarefa. Requer confirmação. Sem menção e sem anexo.',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto (opcional, para desambiguar a tarefa)' },
        tarefa: { type: 'string', description: 'título da tarefa' },
        texto: { type: 'string', description: 'texto do comentário' },
      },
      required: ['tarefa', 'texto'],
      additionalProperties: false,
    },
  },
}

async function propose(_profile, args) {
  const texto = (args?.texto || '').trim()
  if (!texto) throw new Error('Qual o texto do comentário?')
  const tarefa = await resolverTarefa(args?.tarefa, { projeto: args?.projeto, acao: 'comentar' })
  return {
    kind: 'comentar_task',
    payload: { task_id: tarefa.id, body: texto },
    descricao: `Comentar na tarefa "${tarefa.title}" do projeto "${tarefa.project_name}".`,
    dados: { projeto: tarefa.project_name, tarefa: tarefa.title, texto },
  }
}

async function execute(profile, payload) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [payload.task_id])
  if (rows.length === 0) throw new Error('A tarefa não existe mais.')
  const { comment } = await inserirComentario({
    taskId: payload.task_id,
    authorId: profile.id,
    body: payload.body,
  })
  return { before: null, after: comment }
}

export default {
  kind: 'write',
  espelha: 'POST /tasks/:id/comments',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
