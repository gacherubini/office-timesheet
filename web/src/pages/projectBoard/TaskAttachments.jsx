import { useState, useEffect, useRef } from 'react'
import { Paperclip, X } from 'lucide-react'
import { api } from '../../lib/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function TaskAttachments({ taskId, currentUserId, isAdmin, onChanged }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  async function load() {
    try {
      setItems(await api.get(`/tasks/${taskId}/attachments`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BASE_URL}/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Falha no upload.')
      }
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(att) {
    if (!confirm('Excluir anexo?')) return
    try {
      await api.delete(`/tasks/${taskId}/attachments/${att.id}`)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}
      <div className="space-y-1.5 mb-2">
        {items.length === 0 && <span className="text-xs text-text-secondary">Sem anexos.</span>}
        {items.map((a) => {
          const canDelete = a.uploaded_by === currentUserId || isAdmin
          return (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <Paperclip size={13} className="text-text-secondary flex-shrink-0" />
              <a href={a.file_url} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate flex-1">
                {a.file_name}
              </a>
              <span className="text-[10px] text-text-secondary flex-shrink-0">{formatSize(a.file_size)}</span>
              {canDelete && (
                <button onClick={() => remove(a)} className="text-text-secondary hover:text-rose-500 flex-shrink-0">
                  <X size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer">
        <Paperclip size={13} />
        {uploading ? 'Enviando...' : 'Anexar arquivo'}
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  )
}
