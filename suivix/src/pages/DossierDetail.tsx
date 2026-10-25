import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  Download,
  FileDown,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Pencil,
  ListChecks,
  History,
  QrCode,
  Trash2,
} from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import { Card, CardContent } from '../lib/shadcn/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/shadcn/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Textarea } from '../lib/shadcn/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../lib/shadcn/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../lib/shadcn/dropdown-menu'
import { useSuivix } from '../lib/suivix/context'
import { canDeleteDossier, canManageDossiers, formatDate, formatDateTime, ROLE_CONFIG, STATUS_CONFIG } from '../lib/suivix/utils'
import type { DossierStatus } from '../lib/suivix/types'
import { PriorityBadge, StatusBadge, MemberAvatar } from '../components/suivix/Badges'
import { DossierFormDialog, parseTagsInput } from '../components/suivix/DossierFormDialog'
import { AttachmentsPanel } from '../components/suivix/AttachmentsPanel'
import { TasksPanel } from '../components/suivix/TasksPanel'
import { HistoryTimeline } from '../components/suivix/HistoryTimeline'
import { PhysicalTrackingPanel } from '../components/suivix/PhysicalTrackingPanel'
import { TraceRail } from '../components/suivix/TraceRail'
import { useShell } from '../components/suivix/Layout'
import { exportDossierAsPdf, exportDossierAsWord } from '../lib/suivix/exportDoc'
import { toast } from '../lib/shadcn/sonner'

export default function DossierDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openPointer } = useShell()
  const {
    state,
    currentMember,
    updateDossier,
    changeDossierStatus,
    deleteDossier,
    addAttachment,
    removeAttachment,
    addTask,
    toggleTask,
    deleteTask,
    addComment,
    setPhysicalLocation,
  } = useSuivix()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [blockReasonOpen, setBlockReasonOpen] = useState(false)
  const [blockReasonText, setBlockReasonText] = useState('')

  const dossier = state.dossiers.find((d) => d.id === id)

  if (!dossier) {
    return (
      <div className="space-y-density-md">
        <p className="text-muted-foreground">Dossier introuvable.</p>
        <Button variant="outline" onClick={() => navigate('/dossiers')}>
          Retour aux dossiers
        </Button>
      </div>
    )
  }

  const canEdit = canManageDossiers(currentMember.role) || dossier.agentId === currentMember.id
  // The secrétariat registers dossiers, so it can correct their details — but not drive their processing.
  const canEditInfo = canEdit || currentMember.role === 'secretariat'
  const canDelete = canDeleteDossier(currentMember.role)
  // Closed dossiers no longer circulate, so they can't be pointed.
  const canPoint = dossier.status !== 'termine'
  const holder = dossier.agentId ? state.members.find((m) => m.id === dossier.agentId) : null
  const dossierAttachments = state.attachments.filter((a) => a.dossierId === dossier.id)
  const dossierTasks = state.tasks.filter((t) => t.dossierId === dossier.id)
  const dossierHistory = state.history.filter((h) => h.dossierId === dossier.id)
  const lastEvent = [...dossierHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
  const lastAuthor = lastEvent?.authorId ? state.members.find((m) => m.id === lastEvent.authorId) : null
  const heldSince = [...dossierHistory]
    .filter((h) => h.type === 'assignment')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
  const openTasks = dossierTasks.filter((t) => !t.done).length

  const handleStatusChange = (status: DossierStatus) => {
    if (status === 'bloque') {
      setBlockReasonText(dossier.blockReason ?? '')
      setBlockReasonOpen(true)
      return
    }
    changeDossierStatus(dossier.id, status, currentMember.id)
    toast.success(`Statut mis à jour : ${STATUS_CONFIG[status].label}`)
  }

  return (
    <div className="space-y-density-xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Fil d'Ariane">
        <Link to="/dossiers" className="hover:text-foreground">
          Dossiers
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-xs uppercase text-foreground">{dossier.reference}</span>
      </nav>

      <div className="flex flex-col gap-density-lg lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="ref text-muted-foreground">{dossier.reference}</span>
            <StatusBadge status={dossier.status} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{dossier.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> {dossier.client}
            </span>
            <PriorityBadge priority={dossier.priority} />
            {dossier.tags.map((t) => (
              <span key={t} className="rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                #{t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-density-sm">
          {canPoint && (
            <Button onClick={() => openPointer(dossier.id)}>
              <ArrowRightLeft className="h-4 w-4" /> Pointer un transfert
            </Button>
          )}
          {canEditInfo && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Modifier
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Plus d'actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => exportDossierAsWord(dossier, state.history, state.attachments, state.tasks, state.members)}>
                <Download /> Exporter en Word
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportDossierAsPdf(dossier, state.history, state.attachments, state.tasks, state.members)}>
                <FileDown /> Exporter en PDF
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
                    <Trash2 /> Supprimer le dossier
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-ink px-density-xl py-2.5 text-white">
          <span className="eyebrow flex items-center gap-2 text-[0.65rem] text-white/80">
            <span className="h-2 w-2 bg-primary" /> Fil de traçabilité
          </span>
          <span className="eyebrow hidden text-[0.6rem] text-white/50 sm:block">Historique horodaté · auditable</span>
        </div>
        <CardContent className="space-y-density-lg p-density-xl">
          <TraceRail dossier={dossier} history={dossierHistory} />
          {lastEvent && (
            <div className="flex flex-col gap-1 border-l-2 border-primary bg-muted/50 px-density-md py-density-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                {lastAuthor && <span className="font-semibold">{lastAuthor.name} · </span>}
                {lastEvent.description}
              </p>
              <span className="ref shrink-0 text-[0.65rem] text-muted-foreground">{formatDateTime(lastEvent.date)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="attachments">
            <TabsList>
              <TabsTrigger value="attachments">
                <Paperclip className="h-4 w-4" /> Pièces jointes
                <span className="rounded bg-muted px-1.5 font-mono text-[0.65rem]">{dossierAttachments.length}</span>
              </TabsTrigger>
              <TabsTrigger value="tasks">
                <ListChecks className="h-4 w-4" /> Tâches
                {openTasks > 0 && <span className="rounded bg-secondary px-1.5 font-mono text-[0.65rem] text-primary">{openTasks}</span>}
              </TabsTrigger>
              <TabsTrigger value="physical">
                <QrCode className="h-4 w-4" /> Suivi physique
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4" /> Historique
              </TabsTrigger>
            </TabsList>
            <TabsContent value="attachments">
              <Card>
                <CardContent className="p-density-lg">
                  <AttachmentsPanel
                    attachments={dossierAttachments}
                    members={state.members}
                    tasks={dossierTasks}
                    canEdit={canEdit}
                    onAdd={(name, fileType, size) => addAttachment(dossier.id, name, fileType, size, currentMember.id)}
                    onRemove={(attId) => removeAttachment(attId, dossier.id, currentMember.id)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tasks">
              <Card>
                <CardContent className="p-density-lg">
                  <TasksPanel
                    tasks={dossierTasks}
                    attachments={dossierAttachments}
                    members={state.members}
                    canEdit={canEdit}
                    onAdd={(title, dueDate, assigneeId, files) => {
                      const task = addTask(dossier.id, title, dueDate, assigneeId, currentMember.id)
                      for (const f of files) addAttachment(dossier.id, f.name, f.fileType, f.size, currentMember.id, task.id)
                      toast.success(files.length ? `Tâche ajoutée avec ${files.length} pièce${files.length > 1 ? 's' : ''} jointe${files.length > 1 ? 's' : ''}` : 'Tâche ajoutée')
                    }}
                    onToggle={(taskId) => toggleTask(taskId, dossier.id, currentMember.id)}
                    onDelete={(taskId) => deleteTask(taskId)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="physical">
              <Card>
                <CardContent className="p-density-lg">
                  <PhysicalTrackingPanel
                    reference={dossier.reference}
                    physicalLocation={dossier.physicalLocation}
                    history={dossierHistory}
                    members={state.members}
                    canEdit={canEdit}
                    onUpdateLocation={(location) => setPhysicalLocation(dossier.id, location, currentMember.id)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history">
              <Card>
                <CardContent className="p-density-lg">
                  <HistoryTimeline
                    history={dossierHistory}
                    members={state.members}
                    canComment={canEdit}
                    onAddComment={(text) => addComment(dossier.id, text, currentMember.id)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-density-lg">
          <Card>
            <CardContent className="space-y-density-md p-density-lg">
              <p className="eyebrow text-[0.6rem] text-muted-foreground">Détenteur actuel</p>
              {holder ? (
                <div className="flex items-center gap-3">
                  <MemberAvatar name={holder.name} color={holder.color} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{holder.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_CONFIG[holder.role].label}
                      {heldSince ? ` · depuis le ${formatDate(heldSince)}` : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Personne ne détient ce dossier pour le moment.</p>
              )}
              {canPoint && (
                <Button variant="outline" className="w-full" onClick={() => openPointer(dossier.id)}>
                  <ArrowRightLeft className="h-4 w-4" /> {holder ? 'Transférer à…' : 'Affecter à…'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-density-sm p-density-lg">
              <p className="eyebrow text-[0.6rem] text-muted-foreground">Statut</p>
              <Select value={dossier.status} onValueChange={(v) => handleStatusChange(v as DossierStatus)} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_CONFIG) as DossierStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dossier.status === 'bloque' && dossier.blockReason && (
                <p className="rounded border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">Motif : {dossier.blockReason}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="divide-y divide-border p-0">
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Emplacement physique" value={dossier.physicalLocation ?? 'Non renseigné'} />
              <InfoRow icon={<CalendarClock className="h-4 w-4" />} label="Échéance" value={formatDate(dossier.dueDate)} />
              <InfoRow icon={<History className="h-4 w-4" />} label="Enregistré le" value={formatDate(dossier.createdAt)} />
              <InfoRow icon={<Pencil className="h-4 w-4" />} label="Dernière mise à jour" value={formatDateTime(dossier.updatedAt)} />
            </CardContent>
          </Card>

          {dossier.description && (
            <Card>
              <CardContent className="space-y-density-xs p-density-lg">
                <p className="eyebrow text-[0.6rem] text-muted-foreground">Description</p>
                <p className="text-sm leading-relaxed">{dossier.description}</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <DossierFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        members={state.members}
        dossier={dossier}
        onSubmit={(values) => {
          updateDossier(
            dossier.id,
            {
              title: values.title,
              client: values.client,
              description: values.description,
              priority: values.priority,
              agentId: values.agentId,
              dueDate: values.dueDate,
              tags: parseTagsInput(values.tags),
            },
            currentMember.id
          )
          toast.success('Dossier mis à jour')
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprime définitivement {dossier.reference} ainsi que ses pièces jointes, tâches et historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                deleteDossier(dossier.id)
                toast.success('Dossier supprimé')
                navigate('/dossiers')
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockReasonOpen} onOpenChange={setBlockReasonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Motif de blocage</AlertDialogTitle>
            <AlertDialogDescription>Indiquez pourquoi ce dossier est bloqué. Ce motif apparaîtra dans les alertes.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={blockReasonText} onChange={(e) => setBlockReasonText(e.target.value)} placeholder="Ex. En attente de pièce complémentaire" />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBlockReasonOpen(false)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                changeDossierStatus(dossier.id, 'bloque', currentMember.id, blockReasonText.trim() || 'Motif non renseigné')
                setBlockReasonOpen(false)
                toast.success('Dossier marqué comme bloqué')
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-density-lg py-density-md">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
