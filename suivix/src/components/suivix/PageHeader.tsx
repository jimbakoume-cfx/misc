import type { ReactNode } from 'react'

// Page title block: mono eyebrow, Satoshi title, optional Sentient italic subtitle, actions on the right.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-density-md sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5 text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 font-editorial text-[0.95rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-density-sm">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-density-xl py-12 text-center">
      <div className="mb-density-md flex h-11 w-11 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-density-md">{action}</div>}
    </div>
  )
}
