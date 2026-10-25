import { IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconChevronsUp as ChevronsUp, IconMinus as Minus } from '@tabler/icons-react'
import { Badge } from '../../lib/shadcn/badge'
import type { DossierStatus, Priority, Role } from '../../lib/suivix/types'
import { AVATAR_COLOR_CLASSES, PRIORITY_CONFIG, ROLE_CONFIG, STATUS_CONFIG, initials } from '../../lib/suivix/utils'

// Brand "pastilles de statut": a square dot plus a mono uppercase label on a tinted ground.
// The three functional colours (validation, attente, rejet) are reserved for states.
const STATUS_TONE: Record<DossierStatus, { pill: string; dot: string }> = {
  nouveau: { pill: 'bg-accent text-accent-foreground', dot: 'bg-primary/60' },
  en_cours: { pill: 'bg-secondary text-primary', dot: 'bg-primary' },
  en_attente: { pill: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  bloque: { pill: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  termine: { pill: 'bg-success/10 text-success', dot: 'bg-success' },
}

export function StatusBadge({ status }: { status: DossierStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 font-mono text-[0.65rem] font-medium uppercase tracking-wider ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 shrink-0 ${tone.dot}`} aria-hidden="true" />
      {STATUS_CONFIG[status].label}
    </span>
  )
}

const PRIORITY_ICON: Record<Priority, { icon: typeof Minus; className: string }> = {
  urgente: { icon: ChevronsUp, className: 'text-destructive' },
  haute: { icon: ChevronUp, className: 'text-warning' },
  normale: { icon: Minus, className: 'text-muted-foreground' },
  basse: { icon: ChevronDown, className: 'text-muted-foreground/70' },
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { icon: Icon, className } = PRIORITY_ICON[priority]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {PRIORITY_CONFIG[priority].label}
    </span>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={role === 'admin' ? 'default' : role === 'directeur' || role === 'chef_service' ? 'secondary' : 'outline'}>{ROLE_CONFIG[role].label}</Badge>
}

export function MemberAvatar({ name, color, src, size = 'md' }: { name: string; color: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : size === 'xl' ? 'h-20 w-20 text-xl' : 'h-8 w-8 text-xs'
  if (src) return <img src={src} alt={name} className={`shrink-0 rounded-full object-cover ring-2 ring-card ${sizeClasses}`} />
  const colorClass = AVATAR_COLOR_CLASSES[color] ?? AVATAR_COLOR_CLASSES['blue']
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-card ${sizeClasses} ${colorClass}`}>
      {initials(name)}
    </div>
  )
}
