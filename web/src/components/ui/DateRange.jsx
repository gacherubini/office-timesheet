import { DateField } from './DateField'

export function DateRange({ from, to, onFromChange, onToChange, fromLabel = 'De', toLabel = 'Até' }) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        {fromLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{fromLabel}</label>
        )}
        <DateField value={from || ''} onChange={(e) => onFromChange?.(e.target.value)} />
      </div>
      <div className="hidden sm:block pb-2 text-text-secondary">→</div>
      <div>
        {toLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{toLabel}</label>
        )}
        <DateField value={to || ''} onChange={(e) => onToChange?.(e.target.value)} />
      </div>
    </div>
  )
}
