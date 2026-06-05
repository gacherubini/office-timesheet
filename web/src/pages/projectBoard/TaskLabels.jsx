import { useState } from 'react'
import { api } from '../../lib/api'
import { LABEL_PALETTE, labelClasses } from './helpers'

export function TaskLabels({ taskId, labels, canManage, onChanged }) {
  const [list, setList] = useState(labels || [])
  const [text, setText] = useState('')
  const [color, setColor] = useState('blue')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const created = await api.post(`/tasks/${taskId}/labels`, { text: text.trim(), color })
      setList((prev) => [...prev, created])
      setText('')
      onChanged?.()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(labelId) {
    setBusy(true)
    try {
      await api.delete(`/tasks/${taskId}/labels/${labelId}`)
      setList((prev) => prev.filter((l) => l.id !== labelId))
      onChanged?.()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {list.length === 0 && <span className="text-xs text-text-secondary">Sem etiquetas.</span>}
        {list.map((l) => (
          <span key={l.id} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${labelClasses(l.color)}`}>
            {l.text}
            {canManage && (
              <button onClick={() => remove(l.id)} disabled={busy} className="hover:opacity-70 leading-none">×</button>
            )}
          </span>
        ))}
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nova etiqueta"
            className="form-control border rounded-lg px-2 py-1 text-xs flex-1"
          />
          <div className="flex gap-1">
            {LABEL_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full ${labelClasses(c)} ${color === c ? 'ring-2 ring-offset-1 ring-text-secondary' : ''}`}
                aria-label={c}
              />
            ))}
          </div>
          <button onClick={add} disabled={busy || !text.trim()} className="text-xs px-2 py-1 rounded-lg bg-accent text-white disabled:opacity-60">+</button>
        </div>
      )}
    </div>
  )
}
