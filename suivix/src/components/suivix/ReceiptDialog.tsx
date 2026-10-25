import { IconMail as Mail, IconPrinter as Printer } from '@tabler/icons-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../lib/shadcn/dialog'
import { Button } from '../../lib/shadcn/button'
import { useSuivix } from '../../lib/suivix/context'
import { craftReceiptMessage } from '../../lib/suivix/notifications'
import type { Dossier } from '../../lib/suivix/types'
import { formatDate, formatDateTime, mailtoLink } from '../../lib/suivix/utils'
import { QrCodeTag } from './QrCodeTag'
import { SuivixLogo } from './Logo'

// Accusé de réception handed to whoever deposited the dossier: printed, or sent by email.
export function ReceiptDialog({ dossier, open, onOpenChange }: { dossier: Dossier | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentCompany } = useSuivix()
  if (!dossier) return null
  const message = craftReceiptMessage(currentCompany.name, dossier.reference, dossier.title, formatDate(dossier.createdAt))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Accusé de réception</DialogTitle>
          <DialogDescription>À remettre au déposant : il cite la référence pour tout suivi.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="print-area space-y-4 rounded-lg border border-border bg-white p-5 text-ink">
            <div className="flex items-start gap-3 border-b border-border pb-3">
              {currentCompany.logo && <img src={currentCompany.logo} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{currentCompany.profile?.legalName || currentCompany.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[currentCompany.profile?.address, currentCompany.profile?.city].filter(Boolean).join(', ')}
                  {currentCompany.profile?.phone ? ` · ${currentCompany.profile.phone}` : ''}
                </p>
                {currentCompany.profile?.niu && <p className="font-mono text-[0.65rem] text-muted-foreground">NIU {currentCompany.profile.niu}</p>}
              </div>
            </div>
            <p className="eyebrow text-[0.65rem] text-primary">Accusé de réception</p>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p>
                  <span className="block text-xs text-muted-foreground">Référence</span>
                  <span className="font-mono text-base font-medium">{dossier.reference}</span>
                </p>
                <p>
                  <span className="block text-xs text-muted-foreground">Objet</span>
                  {dossier.title}
                </p>
                <p>
                  <span className="block text-xs text-muted-foreground">Déposé par</span>
                  {dossier.client}
                </p>
                <p>
                  <span className="block text-xs text-muted-foreground">Enregistré le</span>
                  {formatDateTime(dossier.createdAt)}
                </p>
              </div>
              <QrCodeTag reference={dossier.reference} size={84} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-[0.65rem] text-muted-foreground">
              <span>Suivi assuré avec</span>
              <SuivixLogo size="sm" />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
          <Button asChild>
            <a href={mailtoLink(dossier.clientEmail, `Accusé de réception — ${dossier.reference}`, message)}>
              <Mail className="h-4 w-4" /> Envoyer par email
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
