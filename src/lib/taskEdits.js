import { query } from './db.js'
import { createNotification } from './notificationsHub.js'
import { logActivity } from './taskActivity.js'

export const VALID_PRIORITY = ['low', 'medium', 'high']

// UPDATE dinâmico + activity + notificação de atribuição. Extraído de
// routes/projectManagement.js para a rota PUT /tasks/:id e a tool de editar
// usarem o mesmo bloco.
export async function aplicarEdicaoTask(id, patch, actorId) {
  const { title, description, assignee_id, due_date, priority, task_type } = patch || {}

  const { rows: taskRows } = await query(
    'SELECT project_id, title, assignee_id, priority FROM tasks WHERE id = $1',
    [id],
  )
  if (taskRows.length === 0) throw new Error('Tarefa não encontrada.')
  const before = taskRows[0]

  const updates = []
  const params = []
  if (title !== undefined) {
    if (!title.trim()) throw new Error('title não pode ser vazio.')
    params.push(title.trim()); updates.push(`title = $${params.length}`)
  }
  if (description !== undefined) {
    params.push(description?.trim() || null); updates.push(`description = $${params.length}`)
  }
  if (assignee_id !== undefined) {
    params.push(assignee_id || null); updates.push(`assignee_id = $${params.length}`)
  }
  if (due_date !== undefined) {
    params.push(due_date || null); updates.push(`due_date = $${params.length}`)
  }
  if (priority !== undefined) {
    if (!VALID_PRIORITY.includes(priority)) {
      throw new Error('priority inválida. Use low, medium ou high.')
    }
    params.push(priority); updates.push(`priority = $${params.length}::task_priority`)
  }
  if (task_type !== undefined) {
    params.push(task_type?.trim() || null); updates.push(`task_type = $${params.length}`)
  }
  if (updates.length === 0) throw new Error('Nenhum campo para atualizar.')

  params.push(id)
  const { rows } = await query(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${params.length}
     RETURNING id, project_id, title, description, status, assignee_id, due_date, position, priority, task_type, completed_at, created_at, updated_at`,
    params,
  )
  const after = rows[0]

  if (title !== undefined && title.trim() !== before.title) {
    await logActivity(id, actorId, 'title_changed', { from: before.title, to: after.title })
  }
  if (priority !== undefined && priority !== before.priority) {
    await logActivity(id, actorId, 'priority_changed', { from: before.priority, to: after.priority })
  }
  if (assignee_id !== undefined && (after.assignee_id || null) !== (before.assignee_id || null)) {
    await logActivity(id, actorId, 'assignee_changed', { to: after.assignee_id })
    if (after.assignee_id) {
      await createNotification({
        userId: after.assignee_id,
        type: 'task_assigned',
        taskId: id,
        actorId,
      })
    }
  }

  return after
}
