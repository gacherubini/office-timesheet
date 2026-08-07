// Grafismo da marca (brand book 05.2): uma linha contínua que percorre o layout.
// Só existe sobre campo de cor sólida — nunca sobre branco.
export function BrandLine({ x1 = 0, y1 = 118, x2 = 100, y2 = -18, opacity = 0.3 }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`rgba(255,255,255,${opacity})`}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
