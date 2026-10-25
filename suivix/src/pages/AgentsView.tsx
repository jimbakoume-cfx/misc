import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../lib/shadcn/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import { computeAgentScorecard, isHolderRole } from '../lib/suivix/utils'
import { MemberAvatar } from '../components/suivix/Badges'
import { Progress } from '../lib/shadcn/progress'
import { PageHeader } from '../components/suivix/PageHeader'

export default function AgentsView() {
  const { state } = useSuivix()
  const navigate = useNavigate()

  const agents = state.members.filter((m) => isHolderRole(m.role))
  const scorecards = agents.map((m) => computeAgentScorecard(m, state.dossiers))
  const unassigned = state.dossiers.filter((d) => !d.agentId && d.status !== 'termine').length

  return (
    <div className="space-y-density-lg">
      <PageHeader eyebrow="Pilotage" title="État des dossiers par détenteur" subtitle="Charge de travail et avancement de chaque détenteur — cliquez sur une carte pour voir ses dossiers." />

      {unassigned > 0 && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="p-density-lg text-sm">
            <span className="font-medium">{unassigned}</span> dossier{unassigned === 1 ? '' : 's'} actif{unassigned === 1 ? '' : 's'} non affecté{unassigned === 1 ? '' : 's'}.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-density-lg md:grid-cols-2 lg:grid-cols-3">
        {scorecards.map((sc) => (
          <Card key={sc.member.id} className="cursor-pointer transition-shadow hover:shadow-retool-md" onClick={() => navigate(`/dossiers?detenteur=${sc.member.id}`)}>
            <CardContent className="p-density-lg space-y-density-md">
              <div className="flex items-center gap-density-sm">
                <MemberAvatar name={sc.member.name} color={sc.member.color} size="lg" />
                <div>
                  <p className="font-semibold">{sc.member.name}</p>
                  <p className="text-xs text-muted-foreground">{sc.total} dossier{sc.total === 1 ? '' : 's'} au total</p>
                </div>
              </div>
              <div className="space-y-density-xs">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Taux de complétion</span>
                  <span>{sc.tauxCompletion}%</span>
                </div>
                <Progress value={sc.tauxCompletion} />
              </div>
              <div className="grid grid-cols-4 gap-density-sm text-center text-xs">
                <div>
                  <p className="text-lg font-semibold">{sc.enCours}</p>
                  <p className="text-muted-foreground">En cours</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-destructive">{sc.bloque}</p>
                  <p className="text-muted-foreground">Bloqués</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-success">{sc.termine}</p>
                  <p className="text-muted-foreground">Terminés</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-warning">{sc.enRetard}</p>
                  <p className="text-muted-foreground">En retard</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-density-lg">
          <h2 className="mb-density-md text-sm font-semibold">Détail par détenteur</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Détenteur</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>En cours</TableHead>
                <TableHead>Bloqués</TableHead>
                <TableHead>Terminés</TableHead>
                <TableHead>En retard</TableHead>
                <TableHead>Délai moyen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecards.map((sc) => (
                <TableRow key={sc.member.id}>
                  <TableCell className="flex items-center gap-2">
                    <MemberAvatar name={sc.member.name} color={sc.member.color} size="sm" />
                    {sc.member.name}
                  </TableCell>
                  <TableCell>{sc.total}</TableCell>
                  <TableCell>{sc.enCours}</TableCell>
                  <TableCell>{sc.bloque}</TableCell>
                  <TableCell>{sc.termine}</TableCell>
                  <TableCell>{sc.enRetard}</TableCell>
                  <TableCell>{sc.delaiMoyen > 0 ? `${sc.delaiMoyen} j` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
