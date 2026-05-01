export function Input({ label, error, className = '', as = 'input', children, ...props }) {
  const Tag = as
  const baseClass =
    'w-full form-control border rounded-lg px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60'

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      )}
      <Tag className={baseClass} {...props}>
        {children}
      </Tag>
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  )
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <Input label={label} as="select" className={className} {...props}>
      {children}
    </Input>
  )
}
