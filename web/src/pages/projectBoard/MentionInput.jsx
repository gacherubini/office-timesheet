import { useState, useRef } from 'react'
import { Button } from '../../components/ui/Button'

// Caixa de texto com autocomplete de menção (@). Ao submeter, devolve
// (texto, [user_ids mencionados ainda presentes no texto]).
export function MentionInput({ users, onSubmit, submitting }) {
  const [text, setText] = useState('')
  const [mentioned, setMentioned] = useState([]) // [{ id, name }]
  const [matchQuery, setMatchQuery] = useState(null) // string após o último @ ou null
  const taRef = useRef(null)

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

  function handleSubmit() {
    if (!text.trim()) return
    const ids = mentioned.filter((u) => text.includes(`@${u.name}`)).map((u) => u.id)
    onSubmit(text.trim(), ids)
    setText('')
    setMentioned([])
    setMatchQuery(null)
  }

  const suggestions =
    matchQuery !== null
      ? users
          .filter((u) => u.name.toLowerCase().includes(matchQuery.toLowerCase()))
          .slice(0, 6)
      : []

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={text}
        onChange={handleChange}
        rows={2}
        placeholder="Escreva um comentário... use @ para mencionar"
        className="w-full form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors resize-none"
      />
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
      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={handleSubmit} disabled={submitting || !text.trim()}>
          {submitting ? 'Enviando...' : 'Comentar'}
        </Button>
      </div>
    </div>
  )
}
