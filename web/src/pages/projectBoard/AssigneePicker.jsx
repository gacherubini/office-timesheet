import { useState, useRef } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { useClickOutside } from '../../hooks/useClickOutside'

export function AssigneePicker({ users, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const current = users.find((u) => u.id === value) || null

  useClickOutside(ref, open, () => setOpen(false))

  const filtered = users
    .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)

  function pick(userId) {
    onChange(userId || null)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-alt border border-border-subtle text-xs text-text-primary hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
      >
        {current ? (
          <>
            <Avatar name={current.name} url={current.avatar_url} size={18} />
            <span className="max-w-[120px] truncate">{current.name}</span>
          </>
        ) : (
          <span className="text-text-secondary">Sem responsável</span>
        )}
        <ChevronDown size={12} className="text-text-secondary" />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-64 bg-surface border border-border-subtle rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
            <Search size={13} className="text-text-secondary" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pessoa..."
              className="flex-1 bg-transparent text-xs text-text-primary outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => pick(null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-alt"
            >
              <X size={14} /> Sem responsável
            </button>
            {filtered.length === 0 && (
              <p className="text-[11px] text-text-secondary text-center py-3">Ninguém encontrado.</p>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-alt ${
                  u.id === value ? 'bg-surface-alt' : ''
                }`}
              >
                <Avatar name={u.name} url={u.avatar_url} size={20} />
                <span className="flex-1 text-left truncate text-text-primary">{u.name}</span>
                {u.position && <span className="text-[10px] text-text-secondary truncate">{u.position}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
