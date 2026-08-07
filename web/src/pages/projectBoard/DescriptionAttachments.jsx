import { useState, useEffect } from 'react'
import { Paperclip } from 'lucide-react'
import { api } from '../../lib/api'
import { AttachmentChip } from './AttachmentChip'

export function DescriptionAttachments({ taskId, currentUserId, isAdmin, uploading, onChanged, refreshKey }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  async function load() {
    try {
      setItems(await api.get(`/tasks/${taskId}/attachments?comment_id=null`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refreshKey])

  async function remove(att) {
    try {
      await api.delete(`/tasks/${taskId}/attachments/${att.id}`)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
  }

  function canRemove(att) {
    return att.uploaded_by === currentUserId || isAdmin
  }

  if (items.length === 0 && !uploading && !error) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {error && <span className="text-[11px] state-danger">{error}</span>}
      {items.map((a) => (
        <AttachmentChip key={a.id} att={a} onRemove={canRemove(a) ? () => remove(a) : undefined} />
      ))}
      {uploading && (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-alt text-[11px] text-text-secondary">
          <Paperclip size={11} /> Enviando...
        </span>
      )}
    </div>
  )
}
