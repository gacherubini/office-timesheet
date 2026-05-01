export function Card({ as: Tag = 'div', className = '', padded = true, children, ...rest }) {
  return (
    <Tag
      className={`bg-surface border border-border-subtle rounded-xl shadow-card ${
        padded ? 'p-5' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
