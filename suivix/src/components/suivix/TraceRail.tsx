import type { Dossier, HistoryEntry } from '../../lib/suivix/types'

// "Fil de traçabilité" from the brand guide: completed steps are filled blue squares joined by
// a blue rule; upcoming steps are empty grey squares. Each step carries its timestamp in mono.
const STEPS = ['Réception', 'Affectation', 'Analyse', 'Validation', 'Archivage'] as const

function currentStepIndex(dossier: Dossier): number {
  switch (dossier.status) {
    case 'nouveau':
      return dossier.agentId ? 1 : 0
    case 'en_cours':
    case 'en_attente':
    case 'bloque':
      return 2
    case 'termine':
      return 4
  }
}

function shortStamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).replace('.', '') + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function stepStamps(dossier: Dossier, history: HistoryEntry[]): (string | null)[] {
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const firstOf = (type: HistoryEntry['type']) => sorted.find((h) => h.type === type)?.date ?? null
  const lastStatus = [...sorted].reverse().find((h) => h.type === 'status_change')?.date ?? null
  return [
    dossier.createdAt,
    firstOf('assignment'),
    sorted.find((h) => h.type === 'status_change')?.date ?? null,
    dossier.status === 'termine' ? lastStatus : null,
    null,
  ]
}

export function TraceRail({ dossier, history, compact = false }: { dossier: Dossier; history: HistoryEntry[]; compact?: boolean }) {
  const current = currentStepIndex(dossier)
  const stamps = stepStamps(dossier, history)
  const paused = dossier.status === 'en_attente'
  const blocked = dossier.status === 'bloque'

  return (
    <ol className="grid grid-cols-5" aria-label="Fil de traçabilité">
      {STEPS.map((label, i) => {
        const done = i < current || (dossier.status === 'termine' && i <= 3)
        const isCurrent = i === current && dossier.status !== 'termine'
        const square = isCurrent && blocked
          ? 'bg-destructive border-destructive'
          : isCurrent && paused
            ? 'bg-warning border-warning'
            : done || isCurrent
              ? 'bg-primary border-primary'
              : 'bg-card border-muted-foreground/40'
        const stamp = stamps[i]
        const caption = isCurrent ? (blocked ? 'Bloqué' : paused ? 'En attente' : 'En cours') : stamp ? shortStamp(stamp) : '—'
        return (
          <li key={label} className="relative flex min-w-0 flex-col">
            <div className="mb-2 flex items-center">
              <span className={`relative z-10 h-3 w-3 shrink-0 border ${square} ${isCurrent ? 'ring-4 ring-primary/15' : ''}`} />
              {i < STEPS.length - 1 && <span className={`h-[2px] flex-1 ${i < current ? 'bg-primary' : 'bg-border'}`} />}
            </div>
            <span className={`eyebrow truncate pr-2 text-[0.6rem] ${isCurrent ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {!compact && (
              <span className={`truncate pr-2 font-mono text-[0.65rem] tabular-nums ${isCurrent && blocked ? 'text-destructive' : isCurrent && paused ? 'text-warning' : 'text-muted-foreground'}`}>
                {caption}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
