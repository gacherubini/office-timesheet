import { useState, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { COLUMNS, statusLabel } from './helpers'
import { useClickOutside } from '../../hooks/useClickOutside'

// Mapa de cores fechado (brand book): neutro para o que ainda não começou,
// atenção (laranja) pra quem está em curso, marrom pra quem espera revisão,
// success/danger dos tokens de estado pra concluído/abandonado.
//
// Tem que haver uma entrada para CADA chave de COLUMNS: o className interpola
// STATUS_STYLES[value] direto, e uma chave faltando vira `undefined` na classe
// — o chip perde toda a cor. Foi o que aconteceu quando 'blocked' entrou no
// quadro (item 8 do PDF) e este mapa não acompanhou.
const STATUS_STYLES = {
  todo: 'bg-surface-alt text-text-secondary',
  in_progress: 'state-attention-soft',
  // Vazado, e não preenchido como "Fazendo": mesma família de laranja porque
  // é o mesmo trabalho, contorno em vez de fundo porque está parado. Com os
  // dois preenchidos, colunas vizinhas ficariam indistinguíveis.
  blocked: 'border border-orange text-orange',
  in_review: 'bg-brown/15 text-brown',
  done: 'state-success-soft',
  abandoned: 'state-danger-soft',
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[value]} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {current.label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-44 bg-surface border border-border-subtle shadow-xl overflow-hidden">
          {COLUMNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pick(c.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-primary hover:bg-surface-alt"
            >
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 ${STATUS_STYLES[c.key]}`}>
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
