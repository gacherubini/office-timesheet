const TONES = {
  neutral: 'bg-surface-alt text-text-secondary',
  success: 'state-success-soft',
  warning: 'state-attention-soft',
  danger: 'state-danger-soft',
  info: '',
  accent: '',
}

// `info` e `accent` usam cor de marca fora dos tokens -soft prontos: o mix
// precisa ser feito em runtime (color-mix), porque o modificador de opacidade
// do Tailwind não resolve alpha sobre var() em valor arbitrário.
const TONE_STYLES = {
  info: {
    backgroundColor: 'color-mix(in srgb, var(--color-brown) 14%, transparent)',
    color: 'var(--color-brown)',
  },
  accent: {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    color: 'var(--color-accent)',
  },
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      style={TONE_STYLES[tone]}
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
