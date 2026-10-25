import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, MapPin, MessageSquare, Pencil, PlusCircle, RefreshCw, UserPlus } from 'lucide-react'
import { Card, CardContent } from '../lib/shadcn/card'
import { Input } from '../lib/shadcn/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { useSuivix } from '../lib/suivix/context'
import { canViewAuditLog, formatDateTime } from '../lib/suivix/utils'
import type { HistoryEventType } from '../lib/suivix/types'
import { MemberAvatar } from '../components/suivix/Badges'
import { PageHeader } from '../components/suivix/PageHeader'

const TYPE_LABEL: Record<HistoryEventType, string> = {
  creation: 'Création',
  status_change: 'Changement de statut',
  assignment: 'Affectation',
  attachment: 'Pièce jointe',
  task: 'Tâche',
  comment: 'Commentaire',
  update: 'Modification',
  physical_move: 'Suivi physique',
}

const TYPE_ICON: Record<HistoryEventType, typeof FileText> = {
  creation: PlusCircle,
  status_change: RefreshCw,
  assignment: UserPlus,
  attachment: FileText,
  task: ClipboardList,
  comment: MessageSquare,
  update: Pencil,
  physical_move: MapPin,
}

export default function AuditLog() {
  const { state, currentMember } = useSuivix()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [memberFilter, setMemberFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const dossierById = useMemo(() => new Map(state.dossiers.map((d) => [d.id, d])), [state.dossiers])
  const memberById = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members])

  const rows = useMemo(() => {
    return [...state.history]
      .filter((h) => memberFilter === 'all' || h.authorId === memberFilter)
      .filter((h) => typeFilter === 'all' || h.type === typeFilter)
      .filter((h) => {
        if (!query.trim()) return true
        const dossier = dossierById.get(h.dossierId)
        const haystack = `${h.description} ${dossier?.reference ?? ''} ${dossier?.title ?? ''}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 300)
  }, [state.history, memberFilter, typeFilter, query, dossierById])

  // Checked after the hooks above: an early return before them breaks React's hook order
  // when the profile changes while this page is open.
  if (!canViewAuditLog(currentMember.role)) {
    return <p className="text-muted-foreground">Cette page est réservée aux administrateurs et à la direction.</p>
  }

  return (
    <div className="space-y-density-lg">
      <PageHeader eyebrow="Pilotage" title="Journal d'audit" subtitle={<>Traçabilité complète des actions sur tous les dossiers — {rows.length} évènement{rows.length === 1 ? '' : 's'} affiché{rows.length === 1 ? '' : 's'}.</>} />

      <div className="flex flex-wrap items-center gap-density-sm">
        <Input className="w-64" placeholder="Rechercher un évènement…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Auteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les auteurs</SelectItem>
            {state.members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Type d'évènement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.keys(TYPE_LABEL) as HistoryEventType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-density-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Dossier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Évènement</TableHead>
                <TableHead>Auteur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Aucun évènement ne correspond à ces critères.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((h) => {
                  const dossier = dossierById.get(h.dossierId)
                  const author = h.authorId ? memberById.get(h.authorId) : null
                  const Icon = TYPE_ICON[h.type]
                  return (
                    <TableRow key={h.id} className="cursor-pointer" onClick={() => navigate(`/dossiers/${h.dossierId}`)}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(h.date)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{dossier?.reference ?? '—'}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" /> {TYPE_LABEL[h.type]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{h.description}</TableCell>
                      <TableCell>
                        {author ? (
                          <div className="flex items-center gap-2">
                            <MemberAvatar name={author.name} color={author.color} size="sm" />
                            <span className="text-sm">{author.name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Système</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
