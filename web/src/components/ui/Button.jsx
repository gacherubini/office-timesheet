const VARIANTS = {
  primary:
    'text-white hover:opacity-90 disabled:opacity-50 transition-opacity',
  secondary:
    'bg-surface border border-border-subtle text-text-primary hover:bg-surface-alt disabled:opacity-50 transition-colors',
  ghost:
    'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-alt disabled:opacity-50 transition-colors',
  danger:
    'text-white hover:opacity-90 disabled:opacity-50 transition-opacity',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const baseClass = 'inline-flex items-center justify-center gap-2 font-medium'
  const bgStyle = isPrimary
    ? 'var(--color-accent)'
    : isDanger
    ? 'var(--state-danger)'
    : undefined
  return (
    <button
      type={type}
      className={`${baseClass} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      style={bgStyle ? { background: bgStyle } : undefined}
      {...props}
    >
      {children}
    </button>
  )
}
