import { query } from './db.js'
import { createNotification } from './notificationsHub.js'
import { logActivity } from './taskActivity.js'

// Insert de comentário + activity + notificações. Extraído de
// routes/taskCollaboration.js para a rota e a tool de comentar usarem o mesmo.
export async function inserirComentario({ taskId, authorId, body, mentionedUserIds = [] }) {
  const { rows: taskRows } = await query(
    'SELECT id, assignee_id FROM tasks WHERE id = $1',
    [taskId],
  )
  if (taskRows.length === 0) throw new Error('Tarefa não encontrada.')
  const task = taskRows[0]

  const { rows } = await query(
    `INSERT INTO task_comments (task_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, task_id, author_id, body, created_at`,
    [taskId, authorId, body],
  )
  const comment = rows[0]

  const mentioned = [...new Set(
    Array.isArray(mentionedUserIds) ? mentionedUserIds.filter(Boolean) : [],
  )].filter((uid) => uid !== authorId)

  for (const uid of mentioned) {
    await query(
      `INSERT INTO task_comment_mentions (comment_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [comment.id, uid],
    )
  }

  await logActivity(taskId, authorId, 'comment_added', null)

  const mentionedSet = new Set(mentioned)
  for (const uid of mentioned) {
    await createNotification({
      userId: uid,
      type: 'mention',
      taskId,
      commentId: comment.id,
      actorId: authorId,
    })
  }

  if (task.assignee_id && task.assignee_id !== authorId && !mentionedSet.has(task.assignee_id)) {
    await createNotification({
      userId: task.assignee_id,
      type: 'task_comment',
      taskId,
      commentId: comment.id,
      actorId: authorId,
    })
  }

  return { comment, mentioned, task }
}
