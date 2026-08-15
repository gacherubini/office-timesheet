// Valida o contexto de tela (projeto/tarefa) contra o banco. O cliente manda
// só UUIDs; nomes vêm daqui. Id inválido/inexistente/deletado é ignorado —
// o chat segue sem o bloco, nunca 400. Sem recorte de papel (paridade com
// GET /projects e GET /tasks/:id). Sem atalho de id nas tools.
import { query } from '../db.js'
import { logContextInvalid } from './audit.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOk(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

function campoOuNulo(valor, campo, profile) {
  if (valor == null || valor === '') return null
  if (!uuidOk(valor)) {
    logContextInvalid({ profile, campo })
    return null
  }
  return valor
}

async function taskCountDoProjeto(projectId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1',
    [projectId],
  )
  return rows[0]?.n ?? 0
}

export async function validarContexto(profile, { project_id, task_id } = {}) {
  const projectId = campoOuNulo(project_id, 'project_id', profile)
  const taskId = campoOuNulo(task_id, 'task_id', profile)

  let projeto = null
  let tarefa = null

  if (projectId) {
    const { rows } = await query(
      'SELECT id, name FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId],
    )
    if (rows[0]) {
      projeto = {
        id: rows[0].id,
        name: rows[0].name,
        taskCount: await taskCountDoProjeto(rows[0].id),
      }
    } else {
      logContextInvalid({ profile, campo: 'project_id' })
    }
  }

  if (taskId) {
    const { rows } = await query(
      `SELECT t.id, t.title, t.project_id, p.name AS project_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
        WHERE t.id = $1`,
      [taskId],
    )
    if (rows[0]) {
      const t = rows[0]
      tarefa = {
        id: t.id,
        title: t.title,
        project_id: t.project_id,
        project_name: t.project_name,
      }
      // A tarefa é a entidade mais específica: se o project_id divergir, ela ganha.
      if (!projeto || projeto.id !== t.project_id) {
        projeto = {
          id: t.project_id,
          name: t.project_name,
          taskCount: await taskCountDoProjeto(t.project_id),
        }
      }
    } else {
      logContextInvalid({ profile, campo: 'task_id' })
    }
  }

  return { projeto, tarefa }
}
