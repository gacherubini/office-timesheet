export function Logo({ size = 28, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <rect x="5" y="5" width="90" height="90" stroke={color} strokeWidth="4" />
      <circle cx="50" cy="50" r="35" stroke={color} strokeWidth="3.5" />
      <line x1="20" y1="80" x2="80" y2="20" stroke={color} strokeWidth="3.5" />
    </svg>
  )
}
