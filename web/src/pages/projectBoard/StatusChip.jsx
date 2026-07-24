import { useState, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { COLUMNS, statusLabel } from './helpers'
import { useClickOutside } from '../../hooks/useClickOutside'

const STATUS_STYLES = {
  todo: 'bg-slate-400/15 text-slate-500',
  in_progress: 'bg-amber-500/15 text-amber-600',
  in_review: 'bg-sky-500/15 text-sky-600',
  done: 'bg-emerald-500/15 text-emerald-600',
  abandoned: 'bg-rose-500/15 text-rose-500',
}

export function StatusChip({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = COLUMNS.find((c) => c.key === value) || { key: value, label: statusLabel(value) }

  useClickOutside(ref, open, () => setOpen(false))

  function pick(status) {
    setOpen(false)
    if (status !== value) onChange(status)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[value]} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {current.label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-44 bg-surface border border-border-subtle rounded-lg shadow-xl overflow-hidden">
          {COLUMNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pick(c.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-alt"
            >
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${STATUS_STYLES[c.key]}`}>
                {c.label}
              </span>
              {c.key === value && <Check size={12} className="text-text-secondary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
