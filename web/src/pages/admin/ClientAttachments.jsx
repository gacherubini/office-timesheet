import { useState, useEffect, useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { AttachmentChip } from '../projectBoard/AttachmentChip'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Anexos do cliente: lista, upload e remoção. Reaproveita o chip de anexo
// usado nas tarefas. Remoção liberada ao autor do upload ou a admin.
export function ClientAttachments({ clientId }) {
  const { profile, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function load() {
    setError('')
    try {
      setItems(await api.get(`/admin/clients/${clientId}/attachments`))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function handleFiles(files) {
    if (!files?.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${BASE_URL}/admin/clients/${clientId}/attachments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
          body: fd,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Falha no upload.')
        }
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(att) {
    try {
      await api.delete(`/admin/clients/${clientId}/attachments/${att.id}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function canRemove(att) {
    return att.uploaded_by === profile?.id || isAdmin
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-text-secondary">Anexos</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-60"
        >
          <Paperclip size={12} /> {uploading ? 'Enviando...' : 'Adicionar'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
      {error && <p className="text-[11px] text-rose-500 mb-2">{error}</p>}
      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">Nenhum anexo.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((a) => (
            <AttachmentChip key={a.id} att={a} onRemove={canRemove(a) ? () => remove(a) : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
