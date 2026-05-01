export function DateRange({ from, to, onFromChange, onToChange, fromLabel = 'De', toLabel = 'Até' }) {
  const inputClass =
    'form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors'

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        {fromLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{fromLabel}</label>
        )}
        <input
          type="date"
          value={from || ''}
          onChange={(e) => onFromChange?.(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="hidden sm:block pb-2 text-text-secondary">→</div>
      <div>
        {toLabel && (
          <label className="block text-[11px] text-text-secondary mb-1">{toLabel}</label>
        )}
        <input
          type="date"
          value={to || ''}
          onChange={(e) => onToChange?.(e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  )
}
