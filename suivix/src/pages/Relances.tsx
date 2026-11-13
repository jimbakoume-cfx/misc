import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconCircleCheck as CheckCircle2 } from '@tabler/icons-react'
import { Card } from '../lib/shadcn/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import { daysSince, formatDate, missingPieces, visibleDossiersFor } from '../lib/suivix/utils'
import { StatusBadge } from '../components/suivix/Badges'
import { EmptyState, PageHeader } from '../components/suivix/PageHeader'
import { RemindButton } from '../components/suivix/PiecesCard'

// Every open dossier still waiting on pieces from the client, longest-waiting first.
export default function Relances() {
  const { state, currentMember } = useSuivix()
  const navigate = useNavigate()
  const rows = useMemo(
    () =>
      visibleDossiersFor(currentMember, state.dossiers)
        .filter((d) => d.status !== 'termine' && missingPieces(d).length > 0)
        .map((d) => {
          const lastReminder = state.history
            .filter((h) => h.dossierId === d.id && h.description.startsWith('Relance envoyée'))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
          return { d, missing: missingPieces(d), lastReminder: lastReminder?.date ?? null }
        })
        .sort((a, b) => daysSince(b.d.createdAt) - daysSince(a.d.createdAt)),
    [currentMember, state.dossiers, state.history]
  )

  return (
    <div className="space-y-density-lg">
      <PageHeader
        eyebrow="Suivi"
        title="Pièces à relancer"
        subtitle={`${rows.length} dossier${rows.length > 1 ? 's' : ''} en attente de pièces du client — une relance précise, et le dossier repart.`}
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Aucune pièce en attente" description="Tous les dossiers en cours sont complets." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dossier</TableHead>
                <TableHead>Pièces manquantes</TableHead>
                <TableHead>Déposé le</TableHead>
                <TableHead>Dernière relance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ d, missing, lastReminder }) => (
                <TableRow key={d.id} className="align-top">
                  <TableCell className="cursor-pointer" onClick={() => navigate(`/dossiers/${d.id}`)}>
                    <p className="ref text-muted-foreground">{d.reference}</p>
                    <p className="font-medium leading-snug">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.client}</p>
                    <div className="mt-1.5">
                      <StatusBadge status={d.status} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-0.5 text-sm">
                      {missing.map((p) => (
                        <li key={p} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(d.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{lastReminder ? formatDate(lastReminder) : 'Jamais'}</TableCell>
                  <TableCell className="text-right">
                    <RemindButton dossier={d} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
