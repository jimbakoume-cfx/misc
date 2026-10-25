import { IconPrinter as Printer } from '@tabler/icons-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../lib/shadcn/dialog'
import { Button } from '../../lib/shadcn/button'
import { useSuivix } from '../../lib/suivix/context'
import type { Handover } from '../../lib/suivix/types'
import { formatDateTime, ROLE_CONFIG } from '../../lib/suivix/utils'
import { SuivixLogo } from './Logo'

// Décharge de transmission: the signed slip proving who handed a dossier to whom, and when.
export function DechargeDialog({ handover, open, onOpenChange }: { handover: Handover | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, currentCompany } = useSuivix()
  if (!handover) return null
  const dossier = state.dossiers.find((d) => d.id === handover.dossierId)
  const from = handover.fromId ? state.members.find((m) => m.id === handover.fromId) : null
  const to = state.members.find((m) => m.id === handover.toId)
  const recorder = state.members.find((m) => m.id === handover.recordedBy)
  const received = (dossier?.pieces ?? []).filter((p) => p.received)
  const person = (m: typeof from) => (m ? `${m.name} — ${m.jobTitle || ROLE_CONFIG[m.role].label}` : 'Non renseigné')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Décharge de transmission</DialogTitle>
          <DialogDescription>Preuve de remise du dossier, à imprimer ou à conserver.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="print-area space-y-4 rounded-lg border border-border bg-white p-5 text-ink">
            <div className="flex items-start gap-3 border-b border-border pb-3">
              {currentCompany.logo && <img src={currentCompany.logo} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{currentCompany.profile?.legalName || currentCompany.name}</p>
                <p className="text-xs text-muted-foreground">{[currentCompany.profile?.address, currentCompany.profile?.city].filter(Boolean).join(', ')}</p>
              </div>
              <span className="ref text-[0.65rem] text-muted-foreground">N° {handover.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}</span>
            </div>
            <p className="eyebrow text-[0.65rem] text-primary">Décharge de transmission de dossier</p>
            <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Référence</dt>
              <dd className="ref text-sm">{dossier?.reference}</dd>
              <dt className="text-muted-foreground">Objet</dt>
              <dd>{dossier?.title}</dd>
              <dt className="text-muted-foreground">Déposant</dt>
              <dd>{dossier?.client}</dd>
              <dt className="text-muted-foreground">Remis par</dt>
              <dd>{person(from)}</dd>
              <dt className="text-muted-foreground">Reçu par</dt>
              <dd className="font-medium">{person(to)}</dd>
              <dt className="text-muted-foreground">Date et heure</dt>
              <dd>{formatDateTime(handover.date)}</dd>
              {handover.location && (
                <>
                  <dt className="text-muted-foreground">Emplacement</dt>
                  <dd>{handover.location}</dd>
                </>
              )}
              {handover.note && (
                <>
                  <dt className="text-muted-foreground">Note</dt>
                  <dd>{handover.note}</dd>
                </>
              )}
            </dl>
            {received.length > 0 && (
              <div className="text-sm">
                <p className="mb-1 text-xs text-muted-foreground">Pièces remises avec le dossier ({received.length})</p>
                <ul className="list-inside list-disc text-xs">
                  {received.map((p) => (
                    <li key={p.name}>{p.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Signature du remettant</p>
                <div className="h-20 rounded border border-border" />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Signature du destinataire</p>
                <div className="flex h-20 items-center justify-center rounded border border-border">
                  {handover.signature ? <img src={handover.signature} alt={`Signature de ${to?.name ?? 'destinataire'}`} className="max-h-full max-w-full" /> : null}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-[0.65rem] text-muted-foreground">
              <span>Enregistrée dans Suivix{recorder ? ` par ${recorder.name}` : ''}</span>
              <SuivixLogo size="sm" />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer la décharge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
