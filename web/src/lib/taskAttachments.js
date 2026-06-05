const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Upload de um arquivo pra tarefa. commentId opcional: se vier, o anexo
// fica ligado ao comentario (mostrado embaixo dele); se nao, e anexo
// "solto" da descricao da tarefa.
export async function uploadAttachment(taskId, file, commentId = null) {
  const fd = new FormData()
  fd.append('file', file)
  if (commentId) fd.append('comment_id', commentId)
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    body: fd,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Falha no upload.')
  }
  return res.json()
}
