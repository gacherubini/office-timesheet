export function Tabs({ value, onChange, items, variant = 'underline' }) {
  if (variant === 'pill') {
    return (
      <div className="inline-flex bg-surface-alt rounded-lg p-1 gap-1">
        {items.map((item) => {
          const active = value === item.value
          return (
            <button
              key={item.value}
              onClick={() => onChange(item.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-surface text-text-primary shadow-card'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex gap-0 border-b border-border-subtle">
      {items.map((item) => {
        const active = value === item.value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={`px-5 py-3 text-sm transition-colors -mb-px ${
              active
                ? 'text-text-primary font-semibold border-b-2'
                : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
            }`}
            style={active ? { borderBottomColor: 'var(--color-accent)' } : undefined}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
