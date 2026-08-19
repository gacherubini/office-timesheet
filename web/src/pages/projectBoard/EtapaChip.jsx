import { useState, useRef } from 'react'
import { ChevronDown, Check, GitBranch } from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'

// Chip de etapa da tarefa (mockup: "Etapa: Executivo"). Autosave via onChange.
// A lista de opções não é mais a estática de lib/taskTypes.js: cada projeto
// tem as suas próprias etapas (Task 7 do backend), então quem usa o chip
// passa `etapas` — as etapas DAQUELE projeto — e recebe de volta o id da
// etapa escolhida (`onChange(stageId)`), não mais o nome.
export function EtapaChip({ value, etapas = [], onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, open, () => setOpen(false))

  const etapaAtual = etapas.find((e) => e.id === value)

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
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-surface-alt text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GitBranch size={12} />
        {etapaAtual ? `Etapa: ${etapaAtual.name}` : 'Etapa'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-48 max-h-64 overflow-y-auto bg-surface border border-border-subtle shadow-xl">
          {etapas.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-text-secondary">
              Nenhuma etapa cadastrada neste projeto.
            </p>
          )}
          {etapas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => pick(e.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-alt"
            >
              {e.name}
              {e.id === value && <Check size={12} className="text-text-secondary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
