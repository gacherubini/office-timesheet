// Sinal de estado pela paleta de estado do tema — não hex cravado.
const STATUS_COLORS = {
  online: 'var(--state-success)',
  running: 'var(--state-success)',
  active: 'var(--state-success)',
  paused: 'var(--color-orange)',
  offline: 'rgba(15, 15, 15, 0.35)',
  inactive: 'rgba(15, 15, 15, 0.35)',
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
