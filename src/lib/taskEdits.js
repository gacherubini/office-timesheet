import { query } from './db.js'
import { createNotification } from './notificationsHub.js'
import { logActivity } from './taskActivity.js'

export const VALID_PRIORITY = ['low', 'medium', 'high']

// UPDATE dinâmico + activity + notificação de atribuição. Extraído de
// routes/projectManagement.js para a rota PUT /tasks/:id e a tool de editar
// usarem o mesmo bloco.
export async function aplicarEdicaoTask(id, patch, actorId) {
  const { title, description, assignee_id, due_date, priority, stage_id } = patch || {}

  const { rows: taskRows } = await query(
    'SELECT project_id, title, assignee_id, priority, stage_id FROM tasks WHERE id = $1',
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
  if (stage_id !== undefined) {
    if (!stage_id) throw new Error('stage_id não pode ser vazio.')
    // A etapa é por projeto (o mesmo nome existe em várias obras) — mover a
    // tarefa para uma etapa de outro projeto tem que falhar aqui, não virar
    // uma FK solta apontando pra fora do projeto da tarefa.
    const { rows: stageRows } = await query(
      'SELECT id FROM project_stages WHERE id = $1 AND project_id = $2',
      [stage_id, before.project_id],
    )
    if (stageRows.length === 0) throw new Error('Etapa não encontrada neste projeto.')
    params.push(stage_id); updates.push(`stage_id = $${params.length}`)
  }
  if (updates.length === 0) throw new Error('Nenhum campo para atualizar.')

  params.push(id)
  const { rows } = await query(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${params.length}
     RETURNING id, project_id, title, description, status, assignee_id, due_date, position, priority, stage_id, completed_at, created_at, updated_at`,
    params,
  )
  const after = rows[0]

  if (title !== undefined && title.trim() !== before.title) {
    await logActivity(id, actorId, 'title_changed', { from: before.title, to: after.title })
  }
  if (priority !== undefined && priority !== before.priority) {
    await logActivity(id, actorId, 'priority_changed', { from: before.priority, to: after.priority })
  }
  if (stage_id !== undefined && after.stage_id !== before.stage_id) {
    // Diferente de status/priority (enums fixos que a tela traduz sozinha),
    // etapa é uma linha em project_stages — guardar só o uuid deixaria a
    // atividade ilegível. Buscamos os nomes de ambos os lados e gravamos
    // junto; os ids continuam no detail para quem for depurar.
    const { rows: nomes } = await query(
      'SELECT id, name FROM project_stages WHERE id = ANY($1::uuid[])',
      [[before.stage_id, after.stage_id].filter(Boolean)],
    )
    const nomePorId = Object.fromEntries(nomes.map((n) => [n.id, n.name]))
    await logActivity(id, actorId, 'stage_changed', {
      from: before.stage_id,
      to: after.stage_id,
      from_name: before.stage_id ? (nomePorId[before.stage_id] || null) : null,
      to_name: nomePorId[after.stage_id] || null,
    })
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
