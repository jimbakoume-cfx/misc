import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconPrinter as Printer, IconSignature as Signature } from '@tabler/icons-react'
import { Button } from '../lib/shadcn/button'
import { Card } from '../lib/shadcn/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import type { Handover } from '../lib/suivix/types'
import { daysSince, formatDateTime, visibleDossiersFor } from '../lib/suivix/utils'
import { PageHeader } from '../components/suivix/PageHeader'
import { DechargeDialog } from '../components/suivix/DechargeDialog'

const PERIODS = [
  { value: '7', label: '7 derniers jours', days: 7 },
  { value: '30', label: '30 derniers jours', days: 30 },
  { value: '90', label: '90 derniers jours', days: 90 },
  { value: 'all', label: 'Tout le registre', days: null },
]

// The handover register: every décharge, as the paper "registre de transmission" would list it.
export default function Transmissions() {
  const { state, currentMember, currentCompany } = useSuivix()
  const [period, setPeriod] = useState('30')
  const [open, setOpen] = useState<Handover | null>(null)
  const visibleIds = useMemo(() => new Set(visibleDossiersFor(currentMember, state.dossiers).map((d) => d.id)), [currentMember, state.dossiers])
  const days = PERIODS.find((p) => p.value === period)?.days ?? null
  const rows = state.handovers
    .filter((h) => visibleIds.has(h.dossierId) && (days == null || daysSince(h.date) <= days))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const name = (id: string | null) => (id ? state.members.find((m) => m.id === id)?.name ?? 'Membre retiré' : 'Dépôt initial')
  const signed = rows.filter((h) => h.signature).length

  return (
    <div className="space-y-density-lg">
      <PageHeader
        eyebrow="Suivi"
        title="Registre des transmissions"
        subtitle={`${rows.length} transmission${rows.length > 1 ? 's' : ''} · ${signed} signée${signed > 1 ? 's' : ''} — qui a remis quel dossier, à qui et quand.`}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer le registre
          </Button>
        }
      />
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-52" aria-label="Période">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card className={`overflow-hidden ${open ? '' : 'print-area'}`}>
        <p className="hidden px-4 pt-4 font-semibold print:block">
          {currentCompany.profile?.legalName || currentCompany.name} — Registre des transmissions
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Dossier</TableHead>
              <TableHead>Remis par</TableHead>
              <TableHead>Reçu par</TableHead>
              <TableHead>Emplacement</TableHead>
              <TableHead>Signature</TableHead>
              <TableHead className="print:hidden" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Aucune transmission sur cette période.
                </TableCell>
              </TableRow>
            )}
            {rows.map((h) => {
              const d = state.dossiers.find((x) => x.id === h.dossierId)
              return (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(h.date)}</TableCell>
                  <TableCell>
                    <Link to={`/dossiers/${h.dossierId}`} className="hover:text-primary">
                      <p className="ref text-muted-foreground">{d?.reference}</p>
                      <p className="max-w-[16rem] truncate text-sm font-medium">{d?.title}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{name(h.fromId)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm font-medium">{name(h.toId)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground">{h.location ?? '—'}</TableCell>
                  <TableCell>
                    {h.signature ? (
                      <img src={h.signature} alt="Signature" className="h-8 max-w-[6rem] object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Non signée</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right print:hidden">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(h)}>
                      <Signature className="h-3.5 w-3.5" /> Décharge
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <DechargeDialog handover={open} open={open != null} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  )
}
