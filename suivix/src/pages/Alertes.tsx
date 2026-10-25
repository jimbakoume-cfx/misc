import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Ban, CalendarClock, Clock3 } from 'lucide-react'
import { Card, CardContent } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { useSuivix } from '../lib/suivix/context'
import { computeAlerts, visibleDossiersFor, type AlertSeverity } from '../lib/suivix/utils'
import type { AlertItem } from '../lib/suivix/utils'
import { PageHeader } from '../components/suivix/PageHeader'

const TYPE_ICON: Record<AlertItem['type'], typeof Clock3> = {
  stagnation: Clock3,
  echeance: CalendarClock,
  blocage: Ban,
}

const TYPE_LABEL: Record<AlertItem['type'], string> = {
  stagnation: 'Sans mouvement',
  echeance: 'Échéance',
  blocage: 'Blocage',
}

function severityBadge(severity: AlertSeverity) {
  if (severity === 'critical') return <Badge variant="destructive">Critique</Badge>
  if (severity === 'warning') return <Badge variant="warning">Attention</Badge>
  return <Badge variant="secondary">Info</Badge>
}

export default function Alertes() {
  const { state, currentMember } = useSuivix()
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const visible = useMemo(() => visibleDossiersFor(currentMember, state.dossiers), [currentMember, state.dossiers])
  const alerts = useMemo(() => computeAlerts(visible), [visible])
  const filtered = typeFilter === 'all' ? alerts : alerts.filter((a) => a.type === typeFilter)

  function dossierRef(id: string) {
    return state.dossiers.find((d) => d.id === id)
  }

  return (
    <div className="space-y-density-lg">
      <div className="flex flex-col gap-density-md sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="Espace de travail" title="Alertes" subtitle={<>{alerts.length} alerte{alerts.length === 1 ? '' : 's'} active{alerts.length === 1 ? '' : 's'}</>} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Type d'alerte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="stagnation">Sans mouvement</SelectItem>
            <SelectItem value="echeance">Échéances</SelectItem>
            <SelectItem value="blocage">Blocages</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-density-sm p-density-xl text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8" />
            <p>Aucune alerte pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-density-sm">
          {filtered.map((a) => {
            const Icon = TYPE_ICON[a.type]
            const dossier = dossierRef(a.dossierId)
            return (
              <Card
                key={a.id}
                className="cursor-pointer transition-shadow hover:shadow-retool-md"
                onClick={() => navigate(`/dossiers/${a.dossierId}`)}
              >
                <CardContent className="flex items-center gap-density-md p-density-lg">
                  <Icon className={`h-5 w-5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : 'text-warning'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[a.type]} {dossier ? `· ${dossier.client}` : ''}
                    </p>
                  </div>
                  {severityBadge(a.severity)}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
