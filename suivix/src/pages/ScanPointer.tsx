import { Link, useParams } from 'react-router-dom'
import { IconArrowsLeftRight as ArrowRightLeft, IconBuilding as Building2, IconFileSearch as FileSearch, IconHandGrab as Hand, IconMapPin as MapPin } from '@tabler/icons-react'
import { Button } from '../lib/shadcn/button'
import { Card, CardContent } from '../lib/shadcn/card'
import { toast } from '../lib/shadcn/sonner'
import { useSuivix } from '../lib/suivix/context'
import { formatDateTime } from '../lib/suivix/utils'
import { MemberAvatar, StatusBadge } from '../components/suivix/Badges'
import { EmptyState } from '../components/suivix/PageHeader'
import { useShell } from '../components/suivix/Layout'

// Opened by scanning a dossier's QR label with any phone camera: the two-tap "pointer" screen.
export default function ScanPointer() {
  const { reference = '' } = useParams<{ reference: string }>()
  const { state, currentMember, assignDossier } = useSuivix()
  const { openPointer } = useShell()
  const dossier = state.dossiers.find((d) => d.reference.toLowerCase() === reference.toLowerCase())

  if (!dossier) {
    return (
      <Card>
        <EmptyState
          icon={<FileSearch className="h-5 w-5" />}
          title={`Dossier ${reference} introuvable`}
          description="Cette étiquette n'appartient pas à l'espace de votre entreprise, ou le dossier a été supprimé."
          action={
            <Button asChild variant="outline">
              <Link to="/dossiers">Rechercher un dossier</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  const holder = dossier.agentId ? state.members.find((m) => m.id === dossier.agentId) : null
  const isMine = dossier.agentId === currentMember.id
  const closed = dossier.status === 'termine'
  const lastMove = state.history
    .filter((h) => h.dossierId === dossier.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

  return (
    <div className="mx-auto max-w-lg space-y-density-lg">
      <div>
        <p className="eyebrow mb-1.5 text-primary">Étiquette scannée</p>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="ref text-muted-foreground">{dossier.reference}</span>
          <StatusBadge status={dossier.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{dossier.title}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" /> {dossier.client}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-density-md p-density-lg">
          <div className="flex items-center gap-3">
            {holder ? <MemberAvatar name={holder.name} color={holder.color} size="lg" /> : <span className="h-11 w-11 rounded-full border border-dashed border-border" />}
            <div className="min-w-0">
              <p className="eyebrow text-[0.6rem] text-muted-foreground">Détenteur actuel</p>
              <p className="truncate font-semibold">{holder ? (isMine ? `${holder.name} (vous)` : holder.name) : 'Non affecté'}</p>
            </div>
          </div>
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            {dossier.physicalLocation ?? 'Emplacement non renseigné'}
          </p>
          {lastMove && (
            <p className="border-l-2 border-primary bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {lastMove.description} · {formatDateTime(lastMove.date)}
            </p>
          )}
        </CardContent>
      </Card>

      {closed ? (
        <p className="text-sm text-muted-foreground">Ce dossier est terminé : il ne circule plus.</p>
      ) : (
        <div className="grid grid-cols-1 gap-density-sm">
          {!isMine && currentMember.role !== 'admin' && (
            <Button
              size="lg"
              className="h-14 text-base"
              onClick={() => {
                assignDossier(dossier.id, currentMember.id, currentMember.id)
                toast.success(`Pointé — vous détenez maintenant ${dossier.reference}.`)
              }}
            >
              <Hand className="h-5 w-5" /> Je prends ce dossier
            </Button>
          )}
          <Button size="lg" variant="outline" className="h-14 text-base" onClick={() => openPointer(dossier.id)}>
            <ArrowRightLeft className="h-5 w-5" /> Transmettre à…
          </Button>
        </div>
      )}

      <Link to={`/dossiers/${dossier.id}`} className="block text-center text-sm font-medium text-primary hover:underline">
        Voir la fiche complète
      </Link>
    </div>
  )
}
