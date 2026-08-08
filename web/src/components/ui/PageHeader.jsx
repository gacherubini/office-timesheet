export function PageHeader({ title, subtitle, badge, actions, children }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl font-light text-text-primary leading-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="font-serif-em text-[15px] leading-snug text-text-secondary mt-1">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap md:pr-12">{actions}</div>}
    </div>
  )
}
