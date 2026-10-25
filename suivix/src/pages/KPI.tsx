import { useState } from 'react'
import { Minus, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import {
  METRIC_LABELS,
  PERIOD_LABELS,
  canViewKpi,
  computeCompositeScore,
  computeMetric,
  daysSince,
  filterDossiersByPeriod,
  isHolderRole,
} from '../lib/suivix/utils'
import type { KpiMetric, KpiPeriod } from '../lib/suivix/types'
import { MemberAvatar } from '../components/suivix/Badges'
import { toast } from '../lib/shadcn/sonner'
import { PageHeader } from '../components/suivix/PageHeader'

export default function KPI() {
  const { state, currentMember, addKpiDefinition, removeKpiDefinition } = useSuivix()
  const [metric, setMetric] = useState<KpiMetric>('taux_completion')
  const [period, setPeriod] = useState<KpiPeriod>('30j')
  const [weight, setWeight] = useState(20)

  if (!canViewKpi(currentMember.role)) {
    return <p className="text-muted-foreground">Cette page est réservée aux administrateurs, directeurs et chefs de service.</p>
  }

  const composite = computeCompositeScore(state.kpiDefinitions, state.dossiers)

  const agents = state.members.filter((m) => isHolderRole(m.role) && m.status === 'actif')
  const scorecards = agents.map((m) => {
    const mine = state.dossiers.filter((d) => d.agentId === m.id)
    const current = mine.filter((d) => daysSince(d.createdAt) <= 30)
    const previous = mine.filter((d) => daysSince(d.createdAt) > 30 && daysSince(d.createdAt) <= 60)
    const currentDone = current.filter((d) => d.status === 'termine').length
    const previousDone = previous.filter((d) => d.status === 'termine').length
    const currentRate = current.length > 0 ? Math.round((currentDone / current.length) * 100) : 0
    const previousRate = previous.length > 0 ? Math.round((previousDone / previous.length) * 100) : 0
    return { member: m, current: current.length, previous: previous.length, currentRate, previousRate }
  })

  return (
    <div className="space-y-density-lg">
      <PageHeader eyebrow="Pilotage" title="KPI & Scorecards" subtitle="Indicateurs de performance et comparaison période à période." />

      <div className="grid grid-cols-1 gap-density-lg md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardContent className="flex flex-col items-center justify-center gap-density-sm p-density-xl">
            <p className="text-xs font-medium uppercase text-muted-foreground">Score global pondéré</p>
            <p className="text-4xl font-bold">{composite != null ? `${composite}` : '—'}</p>
            <p className="text-xs text-muted-foreground">sur 100, basé sur {state.kpiDefinitions.length} indicateur{state.kpiDefinitions.length === 1 ? '' : 's'}</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Indicateurs prédéfinis</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-density-md sm:grid-cols-3">
            {state.kpiDefinitions.map((def) => {
              const scoped = filterDossiersByPeriod(state.dossiers, def.period)
              const result = computeMetric(def.metric, scoped)
              return (
                <div key={def.id} className="rounded-md border border-border p-density-md">
                  <div className="flex items-start justify-between">
                    <p className="text-xs text-muted-foreground">{def.name}</p>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label="Supprimer l'indicateur" onClick={() => removeKpiDefinition(def.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-2xl font-semibold">
                    {result.value}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">{result.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Poids {def.weight}%</p>
                </div>
              )
            })}
            {state.kpiDefinitions.length === 0 && <p className="text-sm text-muted-foreground">Aucun indicateur défini.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un indicateur personnalisé</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-density-md">
          <div className="space-y-density-xs">
            <Label>Métrique</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as KpiMetric)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABELS) as KpiMetric[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-density-xs">
            <Label>Période</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as KpiPeriod)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as KpiPeriod[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-density-xs">
            <Label>Pondération (%)</Label>
            <div className="flex items-center gap-density-xs">
              <Button size="icon" variant="outline" onClick={() => setWeight((w) => Math.max(0, w - 5))} aria-label="Diminuer">
                <Minus className="h-4 w-4" />
              </Button>
              <Input className="w-16 text-center" value={weight} onChange={(e) => setWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
              <Button size="icon" variant="outline" onClick={() => setWeight((w) => Math.min(100, w + 5))} aria-label="Augmenter">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            onClick={() => {
              addKpiDefinition({ name: `${METRIC_LABELS[metric]} (${PERIOD_LABELS[period]})`, metric, period, weight })
              toast.success('Indicateur ajouté')
            }}
          >
            Ajouter l'indicateur
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scorecards par agent — période à période (30 derniers jours vs 30 précédents)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Dossiers (30j)</TableHead>
                <TableHead>Dossiers (30j précédents)</TableHead>
                <TableHead>Taux de complétion (30j)</TableHead>
                <TableHead>Évolution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecards.map((sc) => {
                const delta = sc.currentRate - sc.previousRate
                return (
                  <TableRow key={sc.member.id}>
                    <TableCell className="flex items-center gap-2">
                      <MemberAvatar name={sc.member.name} color={sc.member.color} size="sm" />
                      {sc.member.name}
                    </TableCell>
                    <TableCell>{sc.current}</TableCell>
                    <TableCell>{sc.previous}</TableCell>
                    <TableCell>{sc.currentRate}%</TableCell>
                    <TableCell>
                      <span className={`flex items-center gap-1 text-sm ${delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {delta > 0 ? <TrendingUp className="h-4 w-4" /> : delta < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                        {delta > 0 ? '+' : ''}
                        {delta}%
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
