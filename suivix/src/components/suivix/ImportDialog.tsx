import { useRef, useState } from 'react'
import { IconDownload as Download, IconFileSpreadsheet as FileSpreadsheet, IconUpload as Upload } from '@tabler/icons-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../lib/shadcn/dialog'
import { Button } from '../../lib/shadcn/button'
import { toast } from '../../lib/shadcn/sonner'
import { useSuivix, type ImportRow } from '../../lib/suivix/context'
import type { DossierStatus, Member } from '../../lib/suivix/types'
import { STATUS_CONFIG } from '../../lib/suivix/utils'

const COLUMNS = ['objet', 'entreprise', 'description', 'detenteur', 'emplacement', 'statut']
const TEMPLATE = `${COLUMNS.join(';')}\nDemande d'agrément;Société Alpha SARL;Dossier reçu au courrier;collaborateur@entreprise.cm;Bureau 12 — Armoire B;En cours\n`

// Splits one CSV line on `;` or `,` (Excel in French uses `;`), honouring double-quoted fields.
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === sep && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function parseRegister(text: string, members: Member[]): { rows: ImportRow[]; skipped: number } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], skipped: 0 }
  const sep = lines[0]!.split(';').length >= lines[0]!.split(',').length ? ';' : ','
  const header = splitLine(lines[0]!, sep).map(normalise)
  const col = (name: string) => header.indexOf(name)
  const statusByLabel = new Map<string, DossierStatus>(
    (Object.keys(STATUS_CONFIG) as DossierStatus[]).flatMap((s) => [[normalise(STATUS_CONFIG[s].label), s] as const, [s, s] as const])
  )
  let skipped = 0
  const rows: ImportRow[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const get = (name: string) => (col(name) >= 0 ? cells[col(name)] ?? '' : '')
    const title = get('objet')
    const client = get('entreprise')
    if (!title || !client) {
      skipped++
      continue
    }
    const holderKey = normalise(get('detenteur'))
    const holder = holderKey ? members.find((m) => normalise(m.email) === holderKey || normalise(m.name) === holderKey) : undefined
    rows.push({
      title,
      client,
      description: get('description'),
      agentId: holder?.id ?? null,
      physicalLocation: get('emplacement') || null,
      status: statusByLabel.get(normalise(get('statut'))) ?? 'nouveau',
    })
  }
  return { rows, skipped }
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, currentMember, importDossiers } = useSuivix()
  const [parsed, setParsed] = useState<{ name: string; rows: ImportRow[]; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-import-suivix.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function readFile(file: File) {
    const { rows, skipped } = parseRegister(await file.text(), state.members)
    setParsed({ name: file.name, rows, skipped })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setParsed(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer un registre existant</DialogTitle>
          <DialogDescription>Reprenez vos dossiers en cours depuis Excel : enregistrez le fichier au format CSV, puis importez-le.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-density-lg">
          <ol className="space-y-2 text-sm">
            <li>
              <span className="font-mono text-xs text-primary">1.</span> Téléchargez le modèle et complétez une ligne par dossier.{' '}
              <button className="font-medium text-primary hover:underline" onClick={downloadTemplate}>
                <Download className="mr-1 inline h-3.5 w-3.5" />
                Modèle CSV
              </button>
            </li>
            <li>
              <span className="font-mono text-xs text-primary">2.</span> Colonnes : <span className="font-mono text-xs">{COLUMNS.join(' ; ')}</span>. Seuls l'objet et
              l'entreprise sont obligatoires ; le détenteur se désigne par son email ou son nom.
            </li>
          </ol>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-input bg-muted/30 px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-accent/50"
          >
            {parsed ? <FileSpreadsheet className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
            <span className="text-sm font-medium">{parsed ? parsed.name : 'Choisir le fichier CSV'}</span>
            {parsed && (
              <span className="text-xs text-muted-foreground">
                {parsed.rows.length} dossier{parsed.rows.length > 1 ? 's' : ''} prêt{parsed.rows.length > 1 ? 's' : ''} à importer
                {parsed.skipped > 0 ? ` · ${parsed.skipped} ligne${parsed.skipped > 1 ? 's' : ''} ignorée${parsed.skipped > 1 ? 's' : ''} (objet ou entreprise manquant)` : ''}
              </span>
            )}
          </button>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!parsed || parsed.rows.length === 0}
            onClick={() => {
              if (!parsed) return
              const n = importDossiers(parsed.rows, currentMember.id)
              toast.success(`${n} dossier${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}.`)
              setParsed(null)
              onOpenChange(false)
            }}
          >
            Importer {parsed && parsed.rows.length > 0 ? `${parsed.rows.length} dossier${parsed.rows.length > 1 ? 's' : ''}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
