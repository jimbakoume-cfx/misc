import { Building2, Check, MapPin, MessageCircle, ShieldCheck, WifiOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Button } from '../lib/shadcn/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../lib/shadcn/alert-dialog'
import { useSuivix } from '../lib/suivix/context'
import { canManageSettings, formatDate, PLAN_LABELS } from '../lib/suivix/utils'
import { CHANNEL_LABELS } from '../lib/suivix/notifications'
import type { NotificationChannel } from '../lib/suivix/types'
import { toast } from '../lib/shadcn/sonner'
import { PageHeader } from '../components/suivix/PageHeader'

const ENTERPRISE_FEATURES = [
  'Dossiers, pièces jointes et tâches illimités',
  "5 types de comptes : Administrateur, Directeur, Chef de service, Collaborateur, Secrétariat",
  'Tableaux de bord, KPI personnalisés et scorecards par agent',
  'Journal d\u2019audit global sur toute l\u2019activité',
  'Alertes multicanal WhatsApp / SMS / Email',
  'Passerelle papier ↔ digital avec étiquettes QR code',
  'Mode résilient hors-ligne avec synchronisation automatique',
  'Export Word / PDF illimité',
]

const MOAT_FEATURES = [
  {
    icon: MessageCircle,
    title: 'Alertes WhatsApp & SMS',
    description:
      "Contrairement aux outils occidentaux qui misent tout sur l'email, Suivix relaie chaque alerte là où vos équipes lisent vraiment leurs messages : WhatsApp et SMS.",
  },
  {
    icon: MapPin,
    title: 'Passerelle papier ↔ digital',
    description:
      'Beaucoup de dossiers restent physiques. Suivix imprime une étiquette QR par dossier pour relier instantanément le papier à sa fiche numérique et savoir où il se trouve.',
  },
  {
    icon: WifiOff,
    title: 'Mode résilient hors-ligne',
    description:
      "Conçu pour les connexions instables : chaque action est enregistrée localement et se synchronise automatiquement au retour du réseau, sans perte de données.",
  },
]

export default function Parametres() {
  const { currentCompany, state, currentMember, updateMemberNotificationChannel, resetDemoData } = useSuivix()

  return (
    <div className="space-y-density-lg">
      <PageHeader eyebrow="Administration" title="Paramètres" subtitle="Informations de l'entreprise, avantages du plan et préférences de notification." />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-density-md p-density-lg">
          <div className="flex items-center gap-density-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold">{currentCompany.name}</p>
              <p className="text-sm text-muted-foreground">
                Cliente depuis {formatDate(currentCompany.createdAt)} · {state.members.length} membres · {state.dossiers.length} dossiers
              </p>
            </div>
          </div>
          <Badge className="text-sm">{PLAN_LABELS[currentCompany.plan]}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ce que couvre le plan Enterprise</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-density-sm sm:grid-cols-2">
          {ENTERPRISE_FEATURES.map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>{f}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-density-sm text-base font-semibold">Ce qui distingue Suivix</h2>
        <div className="grid grid-cols-1 gap-density-lg md:grid-cols-3">
          {MOAT_FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="space-y-density-sm p-density-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes préférences de notification</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-density-md">
          <p className="text-sm text-muted-foreground">Canal utilisé pour vous alerter des affectations, blocages et tâches :</p>
          <Select value={currentMember.notificationChannel} onValueChange={(v) => updateMemberNotificationChannel(currentMember.id, v as NotificationChannel)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {canManageSettings(currentMember.role) && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Zone Admin
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-density-md">
            <p className="text-sm text-muted-foreground">Réinitialise toutes les données de démonstration (dossiers, équipe, notifications) à leur état initial.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  Réinitialiser la démo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Réinitialiser toutes les données ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Toutes les modifications faites pendant cette session seront perdues et remplacées par le jeu de données de démonstration
                    initial.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      toast.success('Réinitialisation en cours…')
                      resetDemoData()
                    }}
                  >
                    Réinitialiser
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
