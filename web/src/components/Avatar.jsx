const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-yellow-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500',
]

export function avatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function Avatar({ name, url, size = 36, className = '' }) {
  const style = { width: size, height: size }
  const fontSize = Math.max(10, Math.floor(size * 0.4))

  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        style={style}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      style={{ ...style, fontSize }}
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarColor(name || '')} ${className}`}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  )
}
