import { query } from './db.js'

// Registra um evento no histórico da tarefa. Best-effort: erros são logados
// mas não derrubam a operação principal.
export async function logActivity(taskId, actorId, type, detail = null) {
  try {
    await query(
      `INSERT INTO task_activity (task_id, actor_id, type, detail)
       VALUES ($1, $2, $3, $4)`,
      [taskId, actorId || null, type, detail ? JSON.stringify(detail) : null]
    )
  } catch (err) {
    console.error('logActivity falhou:', err.message)
  }
}
