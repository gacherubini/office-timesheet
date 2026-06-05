import { useState, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { PendingChip } from './AttachmentChip'
import { useDropzone } from '../../hooks/useDropzone'

// Caixa de texto com autocomplete de menção (@) + anexos arrastando arquivos.
// Ao submeter, devolve (texto, [user_ids mencionados], [File pendentes]).
export function MentionInput({ users, onSubmit, submitting }) {
  const [text, setText] = useState('')
  const [mentioned, setMentioned] = useState([]) // [{ id, name }]
  const [matchQuery, setMatchQuery] = useState(null)
  const [files, setFiles] = useState([])
  const taRef = useRef(null)
  const { dragOver, dropProps } = useDropzone((dropped) =>
    setFiles((prev) => [...prev, ...dropped])
  )

  function detectQuery(value, cursor) {
    const before = value.slice(0, cursor)
    const m = before.match(/@([^@\n]*)$/)
    setMatchQuery(m ? m[1] : null)
  }

  function handleChange(e) {
    setText(e.target.value)
    detectQuery(e.target.value, e.target.selectionStart)
  }

  function pickUser(user) {
    const ta = taRef.current
    const cursor = ta ? ta.selectionStart : text.length
    const before = text.slice(0, cursor).replace(/@([^@\n]*)$/, `@${user.name} `)
    const after = text.slice(cursor)
    setText(before + after)
    setMatchQuery(null)
    setMentioned((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]))
    setTimeout(() => ta?.focus(), 0)
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit() {
    if (!text.trim() && files.length === 0) return
    const ids = mentioned.filter((u) => text.includes(`@${u.name}`)).map((u) => u.id)
    onSubmit(text.trim(), ids, files)
    setText('')
    setMentioned([])
    setMatchQuery(null)
    setFiles([])
  }

  const suggestions =
    matchQuery !== null
      ? users
          .filter((u) => u.name.toLowerCase().includes(matchQuery.toLowerCase()))
          .slice(0, 6)
      : []

  return (
    <div className="relative">
      <div className="relative" {...dropProps}>
        <textarea
          ref={taRef}
          value={text}
          onChange={handleChange}
          rows={2}
          placeholder="Escreva um comentário... use @ para mencionar (arraste arquivos pra anexar)"
          className="w-full form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors resize-none"
        />
        {dragOver && (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-accent">Solte para anexar ao comentário</span>
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="absolute z-10 left-0 right-0 -top-2 -translate-y-full bg-surface border border-border-subtle rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((u) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); pickUser(u) }}
              className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-alt"
            >
              {u.name}
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <PendingChip key={i} file={f} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={handleSubmit} disabled={submitting || (!text.trim() && files.length === 0)}>
          {submitting ? 'Enviando...' : 'Comentar'}
        </Button>
      </div>
    </div>
  )
}
