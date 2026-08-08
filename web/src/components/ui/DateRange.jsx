import { DateField } from './DateField'

// "De" trava no máximo em "Até", e "Até" trava no mínimo em "De" — sem essas
// travas cruzadas dá pra pedir um intervalo invertido (De depois de Até) e a
// requisição volta vazia sem explicação.
export function DateRange({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel = 'De',
  toLabel = 'Até',
  size = 'md',
}) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        {fromLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{fromLabel}</label>
        )}
        <DateField
          value={from || ''}
          onChange={(e) => onFromChange?.(e.target.value)}
          max={to || undefined}
          size={size}
        />
      </div>
      <div className="hidden sm:block pb-2 text-text-secondary">→</div>
      <div>
        {toLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{toLabel}</label>
        )}
        <DateField
          value={to || ''}
          onChange={(e) => onToChange?.(e.target.value)}
          min={from || undefined}
          size={size}
        />
      </div>
    </div>
  )
}
