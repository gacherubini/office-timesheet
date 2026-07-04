const STATUS_COLORS = {
  online: '#16A34A',
  running: '#16A34A',
  active: '#16A34A',
  paused: '#E8B004',
  offline: '#94A0AE',
  inactive: '#94A0AE',
}

const STATUS_LABELS = {
  online: 'Online',
  offline: 'Offline',
  running: 'Em andamento',
  paused: 'Pausado',
  active: 'Ativo',
  inactive: 'Inativo',
}

export function StatusDot({ status = 'offline', label, size = 8 }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline
  const text = label ?? STATUS_LABELS[status] ?? status

  return (
    <div className="inline-flex items-center gap-2 text-xs text-text-secondary">
      <span
        className="rounded-full inline-block flex-shrink-0"
        style={{ width: size, height: size, background: color }}
      />
      {text}
    </div>
  )
}
