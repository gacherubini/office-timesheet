const TONES = {
  neutral: 'bg-surface-alt text-text-secondary',
  success: 'state-success-soft',
  warning: 'state-attention-soft',
  danger: 'state-danger-soft',
  info: '',
  accent: '',
}

// `info` e `accent` usam cor de marca fora dos tokens -soft prontos. As
// cores do tailwind.config.js já são funções (withAlpha) que resolvem
// opacidade sobre var() via color-mix, mas só para classes bg-*/text-*
// conhecidas do Tailwind em tempo de build; aqui o tom vem por prop em
// runtime, então o mesmo color-mix é montado à mão em style.
const TONE_STYLES = {
  info: {
    backgroundColor: 'color-mix(in srgb, var(--color-brown) 15%, transparent)',
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
