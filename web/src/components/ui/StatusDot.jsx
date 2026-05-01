const STATUS_COLORS = {
  online: '#4CAF50',
  running: '#4CAF50',
  active: '#4CAF50',
  paused: '#D4792C',
  offline: '#A09A90',
  inactive: '#A09A90',
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
