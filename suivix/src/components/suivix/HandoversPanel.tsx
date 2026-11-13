import { useState } from 'react'
import { IconArrowRight as ArrowRight, IconSignature as Signature, IconPrinter as Printer } from '@tabler/icons-react'
import { Button } from '../../lib/shadcn/button'
import { useSuivix } from '../../lib/suivix/context'
import type { Handover } from '../../lib/suivix/types'
import { formatDateTime } from '../../lib/suivix/utils'
import { DechargeDialog } from './DechargeDialog'

// The décharges of one dossier, newest first, each printable.
export function HandoversPanel({ handovers }: { handovers: Handover[] }) {
  const { state } = useSuivix()
  const [open, setOpen] = useState<Handover | null>(null)
  const sorted = [...handovers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const name = (id: string | null) => (id ? state.members.find((m) => m.id === id)?.name ?? 'Membre retiré' : 'Dépôt initial')

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune transmission pour le moment. Chaque « Pointer un transfert » génère une décharge.</p>
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {sorted.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {name(h.fromId)} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {name(h.toId)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(h.date)}
                {h.location ? ` · ${h.location}` : ''}
              </p>
            </div>
            {h.signature ? (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <Signature className="h-3.5 w-3.5" /> Signée
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Non signée</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpen(h)}>
              <Printer className="h-3.5 w-3.5" /> Décharge
            </Button>
          </li>
        ))}
      </ul>
      <DechargeDialog handover={open} open={open != null} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  )
}
