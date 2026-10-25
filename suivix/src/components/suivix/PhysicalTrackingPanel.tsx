import { useState } from 'react'
import { IconMapPin as MapPin, IconPrinter as Printer } from '@tabler/icons-react'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'
import { QrCodeTag } from './QrCodeTag'
import type { HistoryEntry, Member } from '../../lib/suivix/types'
import { formatDateTime } from '../../lib/suivix/utils'

export function PhysicalTrackingPanel({
  reference,
  physicalLocation,
  history,
  members,
  canEdit,
  onUpdateLocation,
}: {
  reference: string
  physicalLocation: string | null
  history: HistoryEntry[]
  members: Member[]
  canEdit: boolean
  onUpdateLocation: (location: string) => void
}) {
  const [value, setValue] = useState(physicalLocation ?? '')
  const moves = history.filter((h) => h.type === 'physical_move').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  function memberName(id: string | null) {
    if (!id) return 'Système'
    return members.find((m) => m.id === id)?.name ?? 'Ancien membre'
  }

  return (
    <div className="grid grid-cols-1 gap-density-lg md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-density-sm">
        <div className="print-area">
          <QrCodeTag reference={reference} />
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimer l'étiquette
        </Button>
        <p className="max-w-[140px] text-center text-[11px] text-muted-foreground">
          Collez cette étiquette sur le dossier papier pour le relier à sa fiche numérique.
        </p>
      </div>

      <div className="space-y-density-md">
        <div className="space-y-density-xs">
          <p className="text-xs font-medium uppercase text-muted-foreground">Emplacement physique actuel</p>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {canEdit ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex. Archives centrales — Allée 3, Casier 12" />
                <Button size="sm" disabled={!value.trim() || value.trim() === physicalLocation} onClick={() => onUpdateLocation(value.trim())}>
                  Mettre à jour
                </Button>
              </div>
            ) : (
              <span className="text-sm">{physicalLocation ?? 'Non renseigné'}</span>
            )}
          </div>
        </div>

        <div className="space-y-density-xs">
          <p className="text-xs font-medium uppercase text-muted-foreground">Historique des déplacements</p>
          {moves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun déplacement enregistré.</p>
          ) : (
            <ul className="space-y-density-xs">
              {moves.map((m) => (
                <li key={m.id} className="rounded-md border border-border px-density-sm py-density-xs text-sm">
                  <p>{m.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(m.date)} · {memberName(m.authorId)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
