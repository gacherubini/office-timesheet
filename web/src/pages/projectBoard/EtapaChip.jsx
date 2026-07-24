import { useState, useRef } from 'react'
import { ChevronDown, Check, GitBranch } from 'lucide-react'
import { TASK_TYPES } from '../../lib/taskTypes'
import { useClickOutside } from '../../hooks/useClickOutside'

// Chip de etapa/tipo da tarefa (mockup: "Etapa: Executivo"). Autosave via onChange.
export function EtapaChip({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, open, () => setOpen(false))

  function pick(v) {
    setOpen(false)
    if (v !== value) onChange(v)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-alt text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GitBranch size={12} />
        {value ? `Etapa: ${value}` : 'Etapa'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-48 max-h-64 overflow-y-auto bg-surface border border-border-subtle rounded-lg shadow-xl">
          <button
            type="button"
            onClick={() => pick('')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-secondary hover:bg-surface-alt"
          >
            Sem etapa
            {!value && <Check size={12} className="text-text-secondary" />}
          </button>
          {TASK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-alt"
            >
              {t}
              {t === value && <Check size={12} className="text-text-secondary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
