// Bolinha discreta que indica apontamento em curso ao lado de um projeto/tarefa.
// Vermelha pulsando quando rodando; âmbar estática quando pausado.
export function LiveDot({ paused = false, size = 8, className = '' }) {
  const color = paused ? 'var(--color-orange)' : 'var(--state-danger)'
  return (
    <span
      title={paused ? 'Apontamento pausado' : 'Apontamento em curso'}
      aria-label={paused ? 'Apontamento pausado' : 'Apontamento em curso'}
      className={`inline-block rounded-full flex-shrink-0 ${paused ? '' : 'rec-dot'} ${className}`}
      style={{ width: size, height: size, background: color }}
    />
  )
}
