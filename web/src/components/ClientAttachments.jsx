import { useState, useEffect, useRef } from 'react'
import { Paperclip, UploadCloud } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useDropzone } from '../hooks/useDropzone'
import { AttachmentChip } from '../pages/projectBoard/AttachmentChip'
import { VisibilityToggle } from './pessoas/VisibilityToggle'

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

  // Só admin alterna (PUT .../attachments/:id — Task 4 já responde 403 para
  // o resto). Atualiza local para não esperar um novo GET só para refletir
  // o clique.
  async function alternarRestricao(att, novo) {
    try {
      const atualizado = await api.put(`/admin/clients/${clientId}/attachments/${att.id}`, {
        is_restricted: novo,
      })
      setItems((prev) => prev.map((a) => (a.id === att.id ? atualizado : a)))
    } catch (err) {
      setError(err.message)
    }
  }

  const { dragOver, dropProps } = useDropzone(handleFiles)

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
      {error && <p className="text-[11px] state-danger mb-2">{error}</p>}
      <div
        {...dropProps}
        onClick={() => items.length === 0 && !uploading && inputRef.current?.click()}
        className={`relative border border-dashed p-3 transition-colors ${
          dragOver ? 'border-accent bg-accent/10' : 'border-border-subtle'
        } ${items.length === 0 ? 'cursor-pointer' : ''}`}
      >
        {items.length === 0 ? (
          <p className={`flex items-center justify-center gap-1.5 text-xs text-text-secondary py-2 ${dragOver ? 'invisible' : ''}`}>
            <UploadCloud size={14} /> Arraste arquivos aqui ou clique para selecionar
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {items.map((a) => (
              // AttachmentChip não é desta task (fora da lista de arquivos
              // permitidos) — o cadeado entra por fora, ao lado do chip, sem
              // mexer nele.
              <div key={a.id} className="inline-flex items-center gap-0.5">
                <AttachmentChip att={a} onRemove={canRemove(a) ? () => remove(a) : undefined} />
                <VisibilityToggle
                  restrito={Boolean(a.is_restricted)}
                  onChange={(novo) => alternarRestricao(a, novo)}
                  podeEditar={isAdmin}
                />
              </div>
            ))}
          </div>
        )}
        {dragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-accent">Solte para anexar ao cliente</span>
          </div>
        )}
      </div>
    </div>
  )
}
