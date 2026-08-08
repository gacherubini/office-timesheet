import { useState, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { PRIORITIES, priorityMeta } from './helpers'
import { useClickOutside } from '../../hooks/useClickOutside'

export function PriorityChip({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = priorityMeta(value)

  useClickOutside(ref, open, () => setOpen(false))

  function pick(p) {
    setOpen(false)
    if (p !== value) onChange(p)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${current.chip} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`w-2 h-2 ${current.dot}`} />
        {current.label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-40 bg-surface border border-border-subtle shadow-xl overflow-hidden">
          {PRIORITIES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-alt"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 ${p.dot}`} />
                {p.label}
              </span>
              {p.key === value && <Check size={12} className="text-text-secondary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
