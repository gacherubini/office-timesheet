import { Card } from './Card'

export function MetricCard({ label, value, icon: Icon, iconColor = 'var(--color-accent)', sublabel }) {
  return (
    <Card className="flex items-start justify-between gap-4 transition-transform hover:-translate-y-0.5">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-medium text-text-secondary mb-2">
          {label}
        </p>
        <p className="font-medium tabular-nums text-2xl text-text-primary truncate">{value}</p>
        {sublabel && <p className="text-xs text-text-secondary mt-1">{sublabel}</p>}
      </div>
      {Icon && (
        <div
          className="w-10 h-10 flex items-center justify-center flex-shrink-0"
          style={{
            background: `color-mix(in srgb, ${iconColor} 15%, transparent)`,
            color: iconColor,
          }}
        >
          <Icon size={20} />
        </div>
      )}
    </Card>
  )
}
