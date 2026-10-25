import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, FolderOpen, ListChecks, Paperclip, Plus, Search, X } from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import { canCreateDossier, canManageDossiers, daysSince, formatDate, openTasksCount, STATUS_CONFIG, visibleDossiersFor } from '../lib/suivix/utils'
import type { Dossier, DossierStatus } from '../lib/suivix/types'
import { PriorityBadge, StatusBadge, MemberAvatar } from '../components/suivix/Badges'
import { PageHeader, EmptyState } from '../components/suivix/PageHeader'
import { useShell } from '../components/suivix/Layout'

// Registration-date filter as fixed periods: a native date input shows the browser's locale format.
const PERIODS: { value: string; label: string; days: number | null }[] = [
  { value: 'all', label: 'Toutes les dates', days: null },
  { value: '1', label: "Reçus aujourd'hui", days: 1 },
  { value: '7', label: 'Reçus sur 7 jours', days: 7 },
  { value: '30', label: 'Reçus sur 30 jours', days: 30 },
  { value: '90', label: 'Reçus sur 90 jours', days: 90 },
]

export default function Dossiers() {
  const { state, currentMember } = useSuivix()
  const { openNewDossier } = useShell()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<string>(params.get('statut') ?? 'all')
  const [agentFilter, setAgentFilter] = useState<string>(params.get('detenteur') ?? 'all')
  const [period, setPeriod] = useState('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }])
  const canCreate = canCreateDossier(currentMember.role)
  const canFilterByAgent = canManageDossiers(currentMember.role) || currentMember.role === 'secretariat'
  // Memoised: a fresh array each render makes the table reset its page index, which re-renders forever.
  const baseDossiers = useMemo(() => visibleDossiersFor(currentMember, state.dossiers), [currentMember, state.dossiers])

  // Full-text search (formerly the Recherche page): reference, object, organisation, description,
  // tags, attachment names and task titles. `matchedIn` explains hits found inside pieces or tasks.
  const q = search.trim().toLowerCase()
  const { filtered, matchedIn } = useMemo(() => {
    const matchedIn = new Map<string, 'pièce jointe' | 'tâche'>()
    const filtered = baseDossiers.filter((d) => {
      if (statusFilter !== 'all' && (statusFilter === 'non_affecte' ? d.agentId : d.status !== statusFilter)) return false
      if (agentFilter !== 'all' && d.agentId !== agentFilter) return false
      const days = PERIODS.find((p) => p.value === period)?.days
      if (days != null && daysSince(d.createdAt) >= days) return false
      if (!q) return true
      const own = `${d.reference} ${d.title} ${d.client} ${d.description} ${d.tags.join(' ')}`.toLowerCase()
      if (own.includes(q)) return true
      if (state.attachments.some((a) => a.dossierId === d.id && a.name.toLowerCase().includes(q))) {
        matchedIn.set(d.id, 'pièce jointe')
        return true
      }
      if (state.tasks.some((t) => t.dossierId === d.id && t.title.toLowerCase().includes(q))) {
        matchedIn.set(d.id, 'tâche')
        return true
      }
      return false
    })
    return { filtered, matchedIn }
  }, [baseDossiers, statusFilter, agentFilter, period, q, state.attachments, state.tasks])

  function agentName(id: string | null) {
    if (!id) return null
    return state.members.find((m) => m.id === id)
  }

  const columns = useMemo<ColumnDef<Dossier>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Référence',
        cell: ({ row }) => <span className="ref whitespace-nowrap text-muted-foreground">{row.original.reference}</span>,
      },
      {
        accessorKey: 'title',
        header: 'Dossier · Entreprise',
        cell: ({ row }) => (
          <div>
            <p className="font-medium leading-snug">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.client}</p>
            {matchedIn.get(row.original.id) && (
              <p className="mt-1 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[0.7rem] text-primary">
                {matchedIn.get(row.original.id) === 'tâche' ? <ListChecks className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
                Trouvé dans une {matchedIn.get(row.original.id)}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        header: 'Priorité',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'agentId',
        header: 'Détenteur',
        cell: ({ row }) => {
          const agent = agentName(row.original.agentId)
          return agent ? (
            <div className="flex items-center gap-2">
              <MemberAvatar name={agent.name} color={agent.color} size="sm" />
              <span className="whitespace-nowrap text-sm">{agent.name}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Non affecté</span>
          )
        },
      },
      {
        accessorKey: 'dueDate',
        header: 'Échéance',
        cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: 'tasks',
        header: 'Tâches',
        cell: ({ row }) => {
          const n = openTasksCount(state.tasks, row.original.id)
          return <span className="whitespace-nowrap text-sm text-muted-foreground">{n > 0 ? `${n} ouverte${n > 1 ? 's' : ''}` : '—'}</span>
        },
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <button className="eyebrow flex items-center gap-1 text-[0.65rem]" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
            Mis à jour <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ row }) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.members, state.tasks, matchedIn]
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <div className="space-y-density-lg">
      <PageHeader
        eyebrow="Espace de travail"
        title="Dossiers"
        subtitle={`${filtered.length} dossier${filtered.length === 1 ? '' : 's'} — retrouvez n'importe quel dossier : qui le détient, où il se trouve, où il en est.`}
        actions={
          canCreate && (
            <Button onClick={openNewDossier}>
              <Plus className="h-4 w-4" />
              Nouveau dossier
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-density-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Référence, objet, entreprise, pièce jointe, tâche…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="non_affecte">Non affectés</SelectItem>
            {(Object.keys(STATUS_CONFIG) as DossierStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canFilterByAgent && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les détenteurs</SelectItem>
              {state.members
                .filter((m) => m.status === 'actif')
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48" aria-label="Date d'enregistrement">
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
        {(search || statusFilter !== 'all' || agentFilter !== 'all' || period !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setAgentFilter('all')
              setPeriod('all')
            }}
          >
            <X className="h-4 w-4" />
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Phones: one card per dossier instead of a table that scrolls sideways. */}
      <ul className="space-y-density-sm md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <li className="rounded-lg border border-border bg-card">
            <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Aucun dossier ne correspond" description="Modifiez la recherche ou les filtres pour élargir les résultats." />
          </li>
        ) : (
          table.getRowModel().rows.map(({ original: d }) => {
            const agent = agentName(d.agentId)
            const hit = matchedIn.get(d.id)
            return (
              <li key={d.id}>
                <button
                  onClick={() => navigate(`/dossiers/${d.id}`)}
                  className="block w-full rounded-lg border border-border bg-card p-density-md text-left shadow-retool-sm transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="ref text-[0.7rem] text-muted-foreground">{d.reference}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mt-1.5 font-medium leading-snug">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.client}</p>
                  {hit && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[0.7rem] text-primary">
                      {hit === 'tâche' ? <ListChecks className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
                      Trouvé dans une {hit}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {agent ? (
                        <>
                          <MemberAvatar name={agent.name} color={agent.color} size="sm" />
                          <span className="truncate">{agent.name}</span>
                        </>
                      ) : (
                        'Non affecté'
                      )}
                    </span>
                    <PriorityBadge priority={d.priority} />
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-retool-sm md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Aucun dossier ne correspond" description="Modifiez la recherche ou les filtres pour élargir les résultats." />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/dossiers/${row.original.id}`)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-density-sm">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
        </span>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Suivant
        </Button>
      </div>

    </div>
  )
}
