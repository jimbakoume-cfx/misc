import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, File as FileIcon, FileText, Paperclip, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '../../lib/shadcn/dialog'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'
import { Textarea } from '../../lib/shadcn/textarea'
import { Label } from '../../lib/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../lib/shadcn/select'
import { toast } from '../../lib/shadcn/sonner'
import type { AttachmentType, Dossier, Member, Priority } from '../../lib/suivix/types'
import { formatFileSize, isHolderRole, PRIORITY_CONFIG } from '../../lib/suivix/utils'
import { useSuivix } from '../../lib/suivix/context'

export interface PendingAttachment {
  name: string
  fileType: AttachmentType
  size: number
}

interface DossierFormValues {
  title: string
  client: string
  description: string
  priority: Priority
  agentId: string | null
  dueDate: string | null
  tags: string
  attachments: PendingAttachment[]
}

export function DossierFormDialog({
  open,
  onOpenChange,
  members,
  dossier,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  dossier?: Dossier
  onSubmit: (values: DossierFormValues) => void
}) {
  const [values, setValues] = useState<DossierFormValues>(emptyValues(dossier))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setValues(emptyValues(dossier))
  }, [open, dossier])

  const assignable = members.filter((m) => m.status === 'actif' && isHolderRole(m.role))

  function addFiles(files: FileList | null) {
    if (!files) return
    const accepted: PendingAttachment[] = []
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase()
      const isPdf = lower.endsWith('.pdf')
      const isWord = lower.endsWith('.doc') || lower.endsWith('.docx')
      if (!isPdf && !isWord) {
        toast.error(`Format non supporté : ${file.name} (Word/PDF uniquement)`)
        continue
      }
      accepted.push({ name: file.name, fileType: isPdf ? 'pdf' : 'word', size: file.size })
    }
    setValues((v) => ({ ...v, attachments: [...v.attachments, ...accepted] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dossier ? 'Modifier le dossier' : 'Enregistrer un dossier'}</DialogTitle>
          {!dossier && <DialogDescription>Le dossier reçoit une référence SVX unique dès son enregistrement.</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-density-lg">
          <div className="space-y-density-xs">
            <Label htmlFor="title">Objet du dossier</Label>
            <Input id="title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} placeholder="Ex. Demande de subvention travaux" />
          </div>
          <div className="space-y-density-xs">
            <Label htmlFor="client">Entreprise / organisation</Label>
            <OrganisationPicker value={values.client} onChange={(client) => setValues((v) => ({ ...v, client }))} />
          </div>
          <div className="space-y-density-xs">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} placeholder="Détails du dossier" />
          </div>
          <div className="grid grid-cols-1 gap-density-md sm:grid-cols-2">
            <div className="space-y-density-xs">
              <Label>Priorité</Label>
              <Select value={values.priority} onValueChange={(v) => setValues((s) => ({ ...s, priority: v as Priority }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-density-xs">
              <Label>Agent affecté</Label>
              <Select value={values.agentId ?? 'none'} onValueChange={(v) => setValues((s) => ({ ...s, agentId: v === 'none' ? null : v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non affecté</SelectItem>
                  {assignable.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className={`grid gap-density-md ${dossier ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {dossier && (
              <div className="space-y-density-xs">
                <Label htmlFor="dueDate">Échéance</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={values.dueDate ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value ? e.target.value : null }))}
                />
              </div>
            )}
            <div className="space-y-density-xs">
              <Label htmlFor="tags">Étiquettes (séparées par virgule)</Label>
              <Input id="tags" value={values.tags} onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value }))} placeholder="urgent, confidentiel" />
            </div>
          </div>

          {!dossier && (
            <div className="space-y-density-xs">
              <Label>Pièces jointes</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  addFiles(e.dataTransfer.files)
                }}
                className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-input bg-muted/30 px-4 py-4 text-center transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <Paperclip className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Ajouter des pièces Word ou PDF</span>
                <span className="text-xs text-muted-foreground">Cliquez ou glissez-déposez vos fichiers ici</span>
              </button>
              {values.attachments.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {values.attachments.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                      {a.fileType === 'pdf' ? <FileText className="h-4 w-4 shrink-0 text-destructive" /> : <FileIcon className="h-4 w-4 shrink-0 text-primary" />}
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                      <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">{formatFileSize(a.size)}</span>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Retirer ${a.name}`}
                        onClick={() => setValues((v) => ({ ...v, attachments: v.attachments.filter((_, j) => j !== i) }))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!values.title.trim() || !values.client.trim()}
            onClick={() => {
              onSubmit({ ...values, client: values.client.trim() })
              onOpenChange(false)
            }}
          >
            {dossier ? 'Enregistrer les modifications' : 'Enregistrer le dossier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Searchable organisation field: suggests organisations already in Suivix as you type and,
// when the name is new, offers to add it — it is then saved with the dossier automatically.
function OrganisationPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { state } = useSuivix()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const known = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of state.dossiers) counts.set(d.client, (counts.get(d.client) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [state.dossiers])

  const q = value.trim().toLowerCase()
  const matches = known.filter(([name]) => !q || name.toLowerCase().includes(q)).slice(0, 6)
  const exact = known.some(([name]) => name.toLowerCase() === q)
  const options: { name: string; count?: number; isNew?: boolean }[] = [
    ...matches.map(([name, count]) => ({ name, count })),
    ...(q && !exact ? [{ name: value.trim(), isNew: true }] : []),
  ]

  function pick(name: string) {
    onChange(name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="client"
        autoComplete="off"
        className="pl-9"
        value={value}
        placeholder="Nom de l'entreprise — tapez pour rechercher"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(options.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(options[active]!.name)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && options.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover p-1 shadow-retool-md">
          {matches.length > 0 && <p className="eyebrow px-2 pb-1 pt-1.5 text-[0.6rem] text-muted-foreground">Organisations existantes</p>}
          {options.map((o, i) => (
            <button
              key={(o.isNew ? 'new-' : '') + o.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(o.name)}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${i === active ? 'bg-accent text-accent-foreground' : ''} ${o.isNew ? 'mt-1 border-t border-border pt-2' : ''}`}
            >
              {o.isNew ? <Plus className="h-4 w-4 shrink-0 text-primary" /> : <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">
                {o.isNew ? (
                  <>
                    Ajouter « <span className="font-medium">{o.name}</span> » comme nouvelle organisation
                  </>
                ) : (
                  o.name
                )}
              </span>
              {!o.isNew && o.name.toLowerCase() === q && <Check className="h-4 w-4 shrink-0 text-primary" />}
              {!o.isNew && o.count != null && <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">{o.count} dossier{o.count > 1 ? 's' : ''}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function emptyValues(dossier?: Dossier): DossierFormValues {
  if (!dossier) {
    return { title: '', client: '', description: '', priority: 'normale', agentId: null, dueDate: null, tags: '', attachments: [] }
  }
  return {
    title: dossier.title,
    client: dossier.client,
    description: dossier.description,
    priority: dossier.priority,
    agentId: dossier.agentId,
    dueDate: dossier.dueDate ? dossier.dueDate.slice(0, 10) : null,
    tags: dossier.tags.join(', '),
    attachments: [],
  }
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}
