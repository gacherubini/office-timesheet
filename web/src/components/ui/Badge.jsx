const TONES = {
  neutral: 'bg-surface-alt text-text-secondary',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  danger: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  info: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  accent: 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]',
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
