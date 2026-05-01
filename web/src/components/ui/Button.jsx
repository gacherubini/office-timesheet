const VARIANTS = {
  primary:
    'text-white hover:opacity-90 disabled:opacity-50 transition-opacity',
  secondary:
    'bg-surface border border-border-subtle text-text-primary hover:bg-surface-alt disabled:opacity-50 transition-colors',
  ghost:
    'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-alt disabled:opacity-50 transition-colors',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors',
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
  const baseClass = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium'
  return (
    <button
      type={type}
      className={`${baseClass} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      style={isPrimary ? { background: 'var(--color-accent)' } : undefined}
      {...props}
    >
      {children}
    </button>
  )
}
