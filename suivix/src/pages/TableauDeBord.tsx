import { type ReactNode, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, ArrowRightLeft, CalendarClock, CheckCircle2, FolderOpen, FolderPlus, Inbox, ListChecks, UserX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Button } from '../lib/shadcn/button'
import { Progress } from '../lib/shadcn/progress'
import { useSuivix } from '../lib/suivix/context'
import {
  computeAgentScorecard,
  computeAlerts,
  daysBetween,
  daysSince,
  formatDate,
  formatDateTime,
  isHolderRole,
  ROLE_CONFIG,
  STATUS_CONFIG,
  visibleDossiersFor,
} from '../lib/suivix/utils'
import type { Dossier, DossierStatus, HistoryEntry, Member } from '../lib/suivix/types'
import { MemberAvatar, PriorityBadge, StatusBadge } from '../components/suivix/Badges'
import { EmptyState, PageHeader } from '../components/suivix/PageHeader'
import { useShell } from '../components/suivix/Layout'

// One dashboard per account type, built only from what that role can see and act on.
export default function TableauDeBord() {
  const { state, currentMember } = useSuivix()
  const visible = useMemo(() => visibleDossiersFor(currentMember, state.dossiers), [currentMember, state.dossiers])
  const firstName = currentMember.name.split(' ')[0]

  const header = (subtitle: string) => (
    <PageHeader eyebrow={`Tableau de bord · ${ROLE_CONFIG[currentMember.role].label}`} title={`Bonjour, ${firstName}`} subtitle={subtitle} />
  )

  switch (currentMember.role) {
    case 'admin':
    case 'directeur':
      return (
        <div className="space-y-density-xl">
          {header("Vue d'ensemble de l'activité de l'organisation : volumes, blocages et charge de l'équipe.")}
          <DirectionDashboard dossiers={visible} />
        </div>
      )
    case 'chef_service':
      return (
        <div className="space-y-density-xl">
          {header("Pilotez votre service : répartissez les dossiers et levez les blocages.")}
          <ServiceDashboard dossiers={visible} />
        </div>
      )
    case 'collaborateur':
      return (
        <div className="space-y-density-xl">
          {header('Vos dossiers, vos tâches et vos prochaines échéances.')}
          <CollaborateurDashboard dossiers={visible} member={currentMember} />
        </div>
      )
    case 'secretariat':
      return (
        <div className="space-y-density-xl">
          {header("Enregistrez les dossiers entrants, orientez-les et sachez où ils se trouvent.")}
          <SecretariatDashboard dossiers={visible} />
        </div>
      )
  }
}

// ---------- Role dashboards ----------

function DirectionDashboard({ dossiers }: { dossiers: Dossier[] }) {
  const { state } = useSuivix()
  const active = dossiers.filter((d) => d.status !== 'termine')
  const blocked = dossiers.filter((d) => d.status === 'bloque')
  const late = active.filter(isLate)
  const doneMonth = dossiers.filter((d) => d.status === 'termine' && daysSince(d.updatedAt) <= 30)
  const statusData = STATUS_ORDER.map((s) => ({ name: STATUS_CONFIG[s].label, value: dossiers.filter((d) => d.status === s).length }))
  const holders = state.members.filter((m) => isHolderRole(m.role) && m.status === 'actif')
  const loadData = holders.map((m) => ({ name: m.name.split(' ')[0], value: active.filter((d) => d.agentId === m.id).length }))

  return (
    <>
      <StatGrid>
        <StatTile label="Dossiers en circulation" value={active.length} hint="Voir les dossiers actifs" to="/dossiers" />
        <StatTile label="Bloqués" value={blocked.length} tone="destructive" hint="Motif à lever" to="/dossiers?statut=bloque" />
        <StatTile label="Échéance dépassée" value={late.length} tone="warning" hint="À relancer" to="/alertes" />
        <StatTile label="Terminés (30 j)" value={doneMonth.length} tone="success" hint="Dossiers clôturés" to="/dossiers?statut=termine" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-2">
        <ChartCard title="Dossiers par statut" data={statusData} colored />
        <ChartCard title="Charge actuelle par détenteur" data={loadData} />
      </div>
      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-5">
        <div className="lg:col-span-3">
          <UnblockList dossiers={dossiers} />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed dossiers={dossiers} />
        </div>
      </div>
    </>
  )
}

function ServiceDashboard({ dossiers }: { dossiers: Dossier[] }) {
  const { state } = useSuivix()
  const active = dossiers.filter((d) => d.status !== 'termine')
  const unassigned = active.filter((d) => !d.agentId)
  const stuck = active.filter((d) => d.status === 'bloque' || d.status === 'en_attente')
  const late = active.filter(isLate)
  const team = state.members.filter((m) => m.role === 'collaborateur' && m.status === 'actif')

  return (
    <>
      <StatGrid>
        <StatTile label="Dossiers actifs" value={active.length} hint="Tous les dossiers du service" to="/dossiers" />
        <StatTile label="Non affectés" value={unassigned.length} tone="warning" hint="À répartir" to="/dossiers?statut=non_affecte" />
        <StatTile label="Bloqués ou en attente" value={stuck.length} tone="destructive" hint="À débloquer" to="/dossiers?statut=bloque" />
        <StatTile label="Échéance dépassée" value={late.length} tone="warning" hint="À relancer" to="/alertes" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Charge de l'équipe</CardTitle>
            <Link to="/agents" className="text-xs font-medium text-primary hover:underline">
              Détails
            </Link>
          </CardHeader>
          <CardContent className="space-y-density-md">
            {team.map((m) => {
              const sc = computeAgentScorecard(m, state.dossiers)
              const open = sc.enCours + sc.bloque
              return (
                <Link key={m.id} to={`/dossiers?detenteur=${m.id}`} className="block rounded-md p-1.5 transition-colors hover:bg-muted/60">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <MemberAvatar name={m.name} color={m.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {open} actif{open > 1 ? 's' : ''}
                      {sc.bloque > 0 && <span className="text-destructive"> · {sc.bloque} bloqué{sc.bloque > 1 ? 's' : ''}</span>}
                    </span>
                  </div>
                  <Progress value={Math.min(100, open * 12.5)} className="h-1.5" />
                </Link>
              )
            })}
          </CardContent>
        </Card>
        <div className="lg:col-span-3">
          <UnblockList dossiers={dossiers} />
        </div>
      </div>
      {unassigned.length > 0 && <AssignList dossiers={unassigned} title="À affecter à un collaborateur" />}
      <ActivityFeed dossiers={dossiers} />
    </>
  )
}

function CollaborateurDashboard({ dossiers, member }: { dossiers: Dossier[]; member: Member }) {
  const { state } = useSuivix()
  const navigate = useNavigate()
  const active = dossiers.filter((d) => d.status !== 'termine')
  const myTasks = state.tasks.filter((t) => !t.done && (t.assigneeId === member.id || active.some((d) => d.id === t.dossierId)))
  const dueSoon = active.filter((d) => d.dueDate && daysBetween(new Date().toISOString(), d.dueDate) <= 7)
  const stuck = active.filter((d) => d.status === 'bloque' || d.status === 'en_attente')
  const byDue = [...active].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  return (
    <>
      <StatGrid>
        <StatTile label="Mes dossiers en main" value={active.length} hint="Voir mes dossiers" to="/dossiers" />
        <StatTile label="Tâches ouvertes" value={myTasks.length} hint="À traiter" />
        <StatTile label="Échéance sous 7 jours" value={dueSoon.length} tone="warning" hint="Priorités de la semaine" to="/alertes" />
        <StatTile label="Bloqués ou en attente" value={stuck.length} tone="destructive" hint="Pièce ou validation attendue" to="/dossiers?statut=bloque" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Mes dossiers, par échéance</CardTitle>
            <Link to="/dossiers" className="text-xs font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {byDue.length === 0 ? (
              <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Aucun dossier en main" description="Les dossiers qui vous sont confiés apparaîtront ici." />
            ) : (
              <ul className="divide-y divide-border">
                {byDue.slice(0, 6).map((d) => (
                  <li key={d.id}>
                    <button onClick={() => navigate(`/dossiers/${d.id}`)} className="flex w-full items-center gap-3 px-density-lg py-3 text-left transition-colors hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="ref text-[0.65rem] text-muted-foreground">{d.reference}</p>
                        <p className="truncate text-sm font-medium">{d.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{d.client}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={d.status} />
                        <span className={`font-mono text-[0.7rem] ${isLate(d) ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {d.dueDate ? `Échéance ${formatDate(d.dueDate)}` : 'Sans échéance'}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mes tâches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {myTasks.length === 0 ? (
              <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Aucune tâche ouverte" description="Bravo, tout est à jour." />
            ) : (
              <ul className="divide-y divide-border">
                {myTasks.slice(0, 7).map((t) => {
                  const d = state.dossiers.find((x) => x.id === t.dossierId)
                  return (
                    <li key={t.id}>
                      <Link to={`/dossiers/${t.dossierId}`} className="flex items-start gap-3 px-density-lg py-3 transition-colors hover:bg-muted/50">
                        <span className="mt-1 h-3 w-3 shrink-0 border border-muted-foreground/50" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{t.title}</span>
                          <span className="block truncate font-mono text-[0.65rem] uppercase text-muted-foreground">
                            {d?.reference} {t.dueDate ? `· ${formatDate(t.dueDate)}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function SecretariatDashboard({ dossiers }: { dossiers: Dossier[] }) {
  const { openNewDossier, openPointer } = useShell()
  const active = dossiers.filter((d) => d.status !== 'termine')
  const today = dossiers.filter((d) => daysSince(d.createdAt) < 1)
  const week = dossiers.filter((d) => daysSince(d.createdAt) <= 7)
  const unassigned = active.filter((d) => !d.agentId)

  return (
    <>
      <div className="grid grid-cols-1 gap-density-md sm:grid-cols-2">
        <QuickAction
          icon={<FolderPlus className="h-5 w-5" />}
          title="Enregistrer un dossier"
          description="Un dossier arrive : il reçoit sa référence SVX et ses pièces jointes."
          onClick={openNewDossier}
          primary
        />
        <QuickAction
          icon={<ArrowRightLeft className="h-5 w-5" />}
          title="Pointer un transfert"
          description="Le dossier change de main ou de bureau : enregistrez-le en quelques secondes."
          onClick={() => openPointer()}
        />
      </div>
      <StatGrid>
        <StatTile label="Reçus aujourd'hui" value={today.length} hint="Nouveaux dossiers" />
        <StatTile label="Reçus cette semaine" value={week.length} hint="7 derniers jours" />
        <StatTile label="À affecter" value={unassigned.length} tone="warning" hint="Sans détenteur" to="/dossiers?statut=non_affecte" />
        <StatTile label="En circulation" value={active.length} hint="Tous les dossiers actifs" to="/dossiers" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AssignList dossiers={unassigned} title="Dossiers à orienter" />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed dossiers={dossiers} types={['assignment', 'physical_move', 'creation']} title="Derniers mouvements" />
        </div>
      </div>
    </>
  )
}

// ---------- Building blocks ----------

const STATUS_ORDER: DossierStatus[] = ['nouveau', 'en_cours', 'en_attente', 'bloque', 'termine']
const STATUS_COLORS = ['hsl(var(--chart-2))', 'hsl(var(--chart-1))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--success))']

function isLate(d: Dossier): boolean {
  return d.status !== 'termine' && !!d.dueDate && daysBetween(new Date().toISOString(), d.dueDate) < 0
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-density-md lg:grid-cols-4">{children}</div>
}

function StatTile({ label, value, hint, tone, to }: { label: string; value: number; hint: string; tone?: 'destructive' | 'warning' | 'success'; to?: string }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-foreground'
  const body = (
    <>
      <p className={`eyebrow text-[0.6rem] ${tone ? color : 'text-muted-foreground'}`}>{label}</p>
      <p className={`mt-2 text-[2rem] font-light leading-none tabular-nums ${color}`}>{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        {hint}
        {to && <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />}
      </p>
    </>
  )
  const cls = 'group block rounded-lg border border-border bg-card p-density-lg shadow-retool-sm transition-all'
  return to ? (
    <Link to={to} className={`${cls} hover:border-primary/40 hover:shadow-retool-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function QuickAction({ icon, title, description, onClick, primary }: { icon: ReactNode; title: string; description: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-start gap-4 rounded-lg border p-density-lg text-left shadow-retool-sm transition-all hover:shadow-retool-md ${
        primary ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${primary ? 'bg-white/15' : 'bg-accent text-primary'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className={`mt-0.5 block text-sm ${primary ? 'text-white/80' : 'text-muted-foreground'}`}>{description}</span>
      </span>
      <ArrowRight className={`mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${primary ? 'text-white/80' : 'text-muted-foreground'}`} />
    </button>
  )
}

function ChartCard({ title, data, colored }: { title: string; data: { name: string; value: number }[]; colored?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 6, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
            <Bar dataKey="value" name="Dossiers" radius={[3, 3, 0, 0]} maxBarSize={44}>
              {data.map((_, i) => (
                <Cell key={i} fill={colored ? STATUS_COLORS[i % STATUS_COLORS.length] : 'hsl(var(--chart-1))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function UnblockList({ dossiers }: { dossiers: Dossier[] }) {
  const navigate = useNavigate()
  const items = dossiers
    .filter((d) => d.status === 'bloque' || d.status === 'en_attente')
    .sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt))
    .slice(0, 5)
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> À débloquer
        </CardTitle>
        <Link to="/alertes" className="text-xs font-medium text-primary hover:underline">
          Toutes les alertes
        </Link>
      </CardHeader>
      <CardContent className="space-y-density-sm">
        {items.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Aucun dossier bloqué" description="Tout circule normalement." />
        ) : (
          items.map((d) => (
            <button
              key={d.id}
              onClick={() => navigate(`/dossiers/${d.id}`)}
              className={`block w-full border-l-2 bg-muted/40 px-density-md py-2.5 text-left transition-colors hover:bg-muted ${d.status === 'bloque' ? 'border-destructive' : 'border-warning'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="ref text-[0.65rem] text-muted-foreground">{d.reference}</span>
                <span className={`font-mono text-[0.65rem] ${d.status === 'bloque' ? 'text-destructive' : 'text-warning'}`}>Inactif {daysSince(d.updatedAt)} j</span>
              </div>
              <p className="truncate text-sm font-medium">{d.title}</p>
              <p className="truncate text-xs text-muted-foreground">{d.blockReason ?? `${STATUS_CONFIG[d.status].label} · ${d.client}`}</p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function AssignList({ dossiers, title }: { dossiers: Dossier[]; title: string }) {
  const { openPointer } = useShell()
  const navigate = useNavigate()
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-warning" /> {title}
        </CardTitle>
        <span className="font-mono text-xs text-muted-foreground">{dossiers.length}</span>
      </CardHeader>
      <CardContent className="p-0">
        {dossiers.length === 0 ? (
          <EmptyState icon={<Inbox className="h-5 w-5" />} title="Tout est orienté" description="Chaque dossier en circulation a un détenteur." />
        ) : (
          <ul className="divide-y divide-border">
            {dossiers.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-density-lg py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/dossiers/${d.id}`)}>
                  <p className="ref text-[0.65rem] text-muted-foreground">{d.reference}</p>
                  <p className="truncate text-sm font-medium hover:text-primary">{d.title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{d.client}</span>
                    <PriorityBadge priority={d.priority} />
                  </div>
                </button>
                <Button size="sm" variant="outline" onClick={() => openPointer(d.id)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Affecter
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityFeed({ dossiers, types, title = 'Activité récente' }: { dossiers: Dossier[]; types?: HistoryEntry['type'][]; title?: string }) {
  const { state } = useSuivix()
  const ids = new Set(dossiers.map((d) => d.id))
  const events = state.history
    .filter((h) => ids.has(h.dossierId) && (!types || types.includes(h.type)))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun mouvement récent.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((h) => {
              const d = state.dossiers.find((x) => x.id === h.dossierId)
              const author = h.authorId ? state.members.find((m) => m.id === h.authorId) : null
              return (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 bg-primary" />
                  <Link to={`/dossiers/${h.dossierId}`} className="block hover:text-primary">
                    <p className="text-sm leading-snug">{h.description}</p>
                  </Link>
                  <p className="mt-0.5 font-mono text-[0.65rem] uppercase text-muted-foreground">
                    {d?.reference} · {formatDateTime(h.date)}
                    {author ? ` · ${author.name}` : ''}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
