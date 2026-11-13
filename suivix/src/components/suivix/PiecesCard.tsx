import { IconMailForward as MailForward } from '@tabler/icons-react'
import { Card, CardContent } from '../../lib/shadcn/card'
import { Button } from '../../lib/shadcn/button'
import { Checkbox } from '../../lib/shadcn/checkbox'
import { toast } from '../../lib/shadcn/sonner'
import { useSuivix } from '../../lib/suivix/context'
import { craftReminderMessage } from '../../lib/suivix/notifications'
import type { Dossier } from '../../lib/suivix/types'
import { mailtoLink, missingPieces } from '../../lib/suivix/utils'
import { dossierTrackingUrl } from './QrCodeTag'

// Opens an email to the depositor listing exactly the missing pieces, and logs the reminder in the history.
export function RemindButton({ dossier, size = 'sm', className }: { dossier: Dossier; size?: 'sm' | 'default'; className?: string }) {
  const { currentCompany, currentMember, recordReminder } = useSuivix()
  const missing = missingPieces(dossier)
  if (missing.length === 0) return null
  const body = craftReminderMessage(currentCompany.name, dossier.reference, dossier.title, missing, dossierTrackingUrl(dossier.reference))
  return (
    <Button variant="outline" size={size} className={className} asChild>
      <a
        href={mailtoLink(dossier.clientEmail, `Pièces manquantes — dossier ${dossier.reference}`, body)}
        onClick={() => {
          recordReminder(dossier.id, missing, currentMember.id)
          if (!dossier.clientEmail) toast.info("Aucun email du déposant n'est enregistré : ajoutez le destinataire dans votre messagerie.")
        }}
      >
        <MailForward className="h-4 w-4" /> Relancer le client
      </a>
    </Button>
  )
}

export function PiecesCard({ dossier, canEdit }: { dossier: Dossier; canEdit: boolean }) {
  const { currentMember, togglePiece } = useSuivix()
  const pieces = dossier.pieces ?? []
  if (pieces.length === 0) return null
  const received = pieces.filter((p) => p.received).length
  const complete = received === pieces.length

  return (
    <Card>
      <CardContent className="space-y-density-sm p-density-lg">
        <div className="flex items-center justify-between">
          <p className="eyebrow text-[0.6rem] text-muted-foreground">Pièces requises</p>
          <span className={`text-xs font-medium tabular-nums ${complete ? 'text-success' : 'text-warning'}`}>
            {received} / {pieces.length} reçues
          </span>
        </div>
        <ul className="space-y-1">
          {pieces.map((p, i) => (
            <li key={p.name}>
              <label className={`flex items-start gap-2.5 rounded px-1 py-1 text-sm ${canEdit ? 'cursor-pointer hover:bg-muted/60' : ''}`}>
                <Checkbox className="mt-0.5" checked={p.received} disabled={!canEdit} onCheckedChange={() => togglePiece(dossier.id, i, currentMember.id)} />
                <span className={p.received ? 'text-muted-foreground' : ''}>{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {!complete && dossier.status !== 'termine' && canEdit && <RemindButton dossier={dossier} className="w-full" />}
      </CardContent>
    </Card>
  )
}
