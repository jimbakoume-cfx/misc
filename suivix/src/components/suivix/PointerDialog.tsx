import { useEffect, useMemo, useState } from 'react'
import { IconArrowsLeftRight as ArrowRightLeft } from '@tabler/icons-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../lib/shadcn/dialog'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'
import { Label } from '../../lib/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../lib/shadcn/select'
import { toast } from '../../lib/shadcn/sonner'
import { useSuivix } from '../../lib/suivix/context'
import { visibleDossiersFor } from '../../lib/suivix/utils'
import type { Handover } from '../../lib/suivix/types'
import { SignaturePad } from './SignaturePad'
import { DechargeDialog } from './DechargeDialog'

// "Pointer un transfert": record that a dossier changed hands (and optionally where it now sits)
// in a few seconds — the core gesture of Suivix (Enregistrer → Pointer → Retrouver).
export function PointerDialog({ open, onOpenChange, dossierId }: { open: boolean; onOpenChange: (open: boolean) => void; dossierId?: string }) {
  const { state, currentMember, assignDossier, setPhysicalLocation, addComment, recordHandover } = useSuivix()
  const [selected, setSelected] = useState<string>('')
  const [holder, setHolder] = useState<string>('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [decharge, setDecharge] = useState<Handover | null>(null)

  const dossiers = useMemo(
    () => visibleDossiersFor(currentMember, state.dossiers).filter((d) => d.status !== 'termine'),
    [currentMember, state.dossiers]
  )
  const dossier = state.dossiers.find((d) => d.id === selected)
  const holders = state.members.filter((m) => m.status === 'actif' && m.role !== 'admin')

  useEffect(() => {
    if (!open) return
    const initial = dossierId ?? ''
    setSelected(initial)
    setHolder(state.dossiers.find((d) => d.id === initial)?.agentId ?? '')
    setLocation('')
    setNote('')
    setSignature(null)
  }, [open, dossierId, state.dossiers])

  function submit() {
    if (!dossier || !holder) return
    const handedOver = holder !== dossier.agentId
    if (handedOver) assignDossier(dossier.id, holder, currentMember.id)
    if (location.trim()) setPhysicalLocation(dossier.id, location.trim(), currentMember.id)
    if (note.trim()) addComment(dossier.id, note.trim(), currentMember.id)
    const receiver = state.members.find((m) => m.id === holder)
    // Every change of hands leaves a décharge, signed by the receiver when they sign on screen.
    const handover = handedOver
      ? recordHandover({ dossierId: dossier.id, fromId: dossier.agentId ?? currentMember.id, toId: holder, location: location.trim() || dossier.physicalLocation, note: note.trim() || null, signature, recordedBy: currentMember.id })
      : null
    toast.success(`Transfert pointé — ${dossier.reference} est maintenant chez ${receiver?.name ?? ''}.`, {
      description: receiver && receiver.id !== currentMember.id ? `${receiver.name} est prévenu(e) par email.` : undefined,
      action: handover ? { label: 'Voir la décharge', onClick: () => setDecharge(handover) } : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            Pointer un transfert
          </DialogTitle>
          <DialogDescription>Le dossier change de main : enregistrez-le en quelques secondes, l'historique se met à jour.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-density-lg">
          <div className="space-y-density-xs">
            <Label>Dossier</Label>
            <Select
              value={selected}
              onValueChange={(v) => {
                setSelected(v)
                setHolder(state.dossiers.find((d) => d.id === v)?.agentId ?? '')
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un dossier en circulation" />
              </SelectTrigger>
              <SelectContent>
                {dossiers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="font-mono text-xs text-muted-foreground">{d.reference}</span> · {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-density-xs">
            <Label>Nouveau détenteur</Label>
            <Select value={holder} onValueChange={setHolder} disabled={!dossier}>
              <SelectTrigger>
                <SelectValue placeholder="Qui reçoit le dossier ?" />
              </SelectTrigger>
              <SelectContent>
                {holders.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.id === dossier?.agentId ? ' (détenteur actuel)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-density-xs">
            <Label htmlFor="ptr-location">Nouvel emplacement physique (facultatif)</Label>
            <Input id="ptr-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Service juridique — Bureau 204" />
          </div>
          <div className="space-y-density-xs">
            <Label htmlFor="ptr-note">Note (facultatif)</Label>
            <Input id="ptr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Remis en main propre pour signature" />
          </div>
          {dossier && holder && holder !== dossier.agentId && (
            <div className="space-y-density-xs">
              <Label>Signature du destinataire (facultatif)</Label>
              <SignaturePad key={`${selected}-${holder}`} onChange={setSignature} />
              <p className="text-xs text-muted-foreground">Une décharge est générée à chaque transmission, signée si le destinataire signe ici.</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!dossier || !holder} onClick={submit}>
            Pointer le transfert
          </Button>
        </DialogFooter>
      </DialogContent>
      <DechargeDialog handover={decharge} open={decharge != null} onOpenChange={(o) => !o && setDecharge(null)} />
    </Dialog>
  )
}
