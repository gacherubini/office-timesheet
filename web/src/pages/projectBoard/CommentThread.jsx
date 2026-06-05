import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Avatar } from '../../components/Avatar'
import { relativeTime } from './helpers'
import { MentionInput } from './MentionInput'

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

  async function handleSubmit(body, mentionedIds) {
    setSubmitting(true)
    try {
      await api.post(`/tasks/${taskId}/comments`, { body, mentioned_user_ids: mentionedIds })
      await load()
      onChanged?.()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir comentário?')) return
    try {
      await api.delete(`/tasks/${taskId}/comments/${id}`)
      await load()
      onChanged?.()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-4">Nenhum comentário ainda.</p>
        )}
        {comments.map((c) => {
          const mentionNames = (c.mentioned_user_ids || [])
            .map((id) => usersById[id]?.name)
            .filter(Boolean)
          const canDelete = c.author_id === currentUserId || isAdmin
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <Avatar name={c.author_name} url={c.author_avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{c.author_name}</span>
                  <span className="text-[10px] text-text-secondary">{relativeTime(c.created_at)}</span>
                  {canDelete && (
                    <button onClick={() => handleDelete(c.id)} className="text-[10px] text-text-secondary hover:text-rose-500 ml-auto">
                      excluir
                    </button>
                  )}
                </div>
                <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                  {renderBody(c.body, mentionNames)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      <MentionInput users={users} onSubmit={handleSubmit} submitting={submitting} />
    </div>
  )
}
