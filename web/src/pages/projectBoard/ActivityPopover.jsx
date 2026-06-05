import { useState, useRef, useEffect } from 'react'
import { History } from 'lucide-react'
import { api } from '../../lib/api'
import { activityText, relativeTime } from './helpers'

export function ActivityPopover({ taskId }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    try {
      setItems(await api.get(`/tasks/${taskId}/activity`))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-text-secondary hover:text-text-primary border border-border-subtle bg-surface-alt hover:bg-surface"
      >
        <History size={12} />
        Atividade
      </button>

      {open && (
        <div className="absolute z-30 right-0 top-full mt-1 w-72 max-h-72 overflow-y-auto bg-surface border border-border-subtle rounded-lg shadow-xl">
          <div className="px-3 py-2 border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-secondary">
            Histórico
          </div>
          {loading && <p className="text-[11px] text-text-secondary py-4 text-center">Carregando...</p>}
          {!loading && items.length === 0 && (
            <p className="text-[11px] text-text-secondary py-4 text-center">Sem atividade.</p>
          )}
          {!loading && items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border-subtle last:border-0">
              <span className="text-[11px] text-text-primary leading-snug">{activityText(a)}</span>
              <span className="text-[10px] text-text-secondary flex-shrink-0">{relativeTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
