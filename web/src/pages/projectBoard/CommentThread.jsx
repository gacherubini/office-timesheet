import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { relativeTime } from './helpers'
import { MentionInput } from './MentionInput'
import { AttachmentChip } from './AttachmentChip'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

async function uploadFileToComment(taskId, commentId, file) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('comment_id', commentId)
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    body: fd,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Falha no upload.')
  }
}

// Destaca os trechos "@Nome" dos usuários mencionados.
function renderBody(body, mentionNames) {
  if (!mentionNames.length) return body
  // monta um regex com os nomes mencionados (escapados), maior primeiro
  const escaped = mentionNames
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(@(?:${escaped.join('|')}))`, 'g')
  return body.split(re).map((part, i) =>
    part.startsWith('@') && mentionNames.some((n) => part === `@${n}`) ? (
      <span key={i} className="text-accent font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function CommentThread({ taskId, users, currentUserId, isAdmin, onChanged }) {
  const [comments, setComments] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]))

  async function load() {
    try {
      setComments(await api.get(`/tasks/${taskId}/comments`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function handleSubmit(body, mentionedIds, files = []) {
    setSubmitting(true); setError('')
    let created = null
    const uploadFails = []
    try {
      created = await api.post(`/tasks/${taskId}/comments`, {
        body: body || '(anexo)',
        mentioned_user_ids: mentionedIds,
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }
    // Upload de arquivos é isolado: falha de um arquivo nao impede o refresh.
    if (created && files.length) {
      for (const file of files) {
        try {
          await uploadFileToComment(taskId, created.id, file)
        } catch (err) {
          uploadFails.push(`${file.name}: ${err.message}`)
        }
      }
    }
    try { await load() } catch (err) { console.error(err) }
    onChanged?.()
    setSubmitting(false)
    if (uploadFails.length) {
      setError(`Falha em ${uploadFails.length} anexo(s): ${uploadFails.join('; ')}`)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.delete(`/tasks/${taskId}/comments/${toDelete.id}`)
      setToDelete(null)
      await load()
      onChanged?.()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-500 text-xs">{error}</div>
      )}
      <div className="space-y-2 mb-4 max-h-96 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-4">Nenhum comentário ainda.</p>
        )}
        {comments.map((c) => {
          const mentionNames = (c.mentioned_user_ids || [])
            .map((id) => usersById[id]?.name)
            .filter(Boolean)
          const canDelete = c.author_id === currentUserId || isAdmin
          const isMine = c.author_id === currentUserId
          return (
            <div
              key={c.id}
              className={`form-control flex items-start gap-2.5 rounded-lg border p-3 ${
                isMine ? 'ring-1 ring-accent/30' : ''
              }`}
            >
              <Avatar name={c.author_name} url={c.author_avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-text-primary">{c.author_name}</span>
                  <span className="text-[10px] text-text-secondary">· {relativeTime(c.created_at)}</span>
                  {canDelete && (
                    <button onClick={() => setToDelete(c)} className="text-[10px] text-text-secondary hover:text-rose-500 ml-auto">
                      excluir
                    </button>
                  )}
                </div>
                <p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                  {renderBody(c.body, mentionNames)}
                </p>
                {c.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.attachments.map((a) => (
                      <AttachmentChip key={a.id} att={a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <MentionInput users={users} onSubmit={handleSubmit} submitting={submitting} />

      <Modal
        open={Boolean(toDelete)}
        onClose={() => (deleting ? null : setToDelete(null))}
        title="Excluir comentário"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-primary">
          Tem certeza que deseja excluir este comentário? Esta ação não pode ser desfeita.
        </p>
        {toDelete && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2">
            <p className="text-xs font-semibold text-text-primary">{toDelete.author_name}</p>
            <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap break-words line-clamp-3">{toDelete.body}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
