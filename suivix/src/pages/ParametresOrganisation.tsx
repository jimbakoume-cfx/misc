import { useState } from 'react'
import { IconCheck as Check, IconDownload as Download, IconPhoto as Photo, IconPlus as Plus, IconTrash as Trash2 } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Textarea } from '../lib/shadcn/textarea'
import { Progress } from '../lib/shadcn/progress'
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
import { companySettings, formatDate, initials, PLAN_LABELS, PLAN_OFFERS, STATUS_CONFIG, mailtoLink } from '../lib/suivix/utils'
import type { CompanyProfile, Plan } from '../lib/suivix/types'
import { toast } from '../lib/shadcn/sonner'
import { Field, ImagePicker, SaveBar } from '../components/suivix/SettingsFields'

// Usage limits per offer, as sold in the commercial deck (null = unlimited).
const PLAN_LIMITS: Record<Plan, { users: number | null; activeDossiers: number | null }> = {
  starter: { users: 3, activeDossiers: 50 },
  pro: { users: 15, activeDossiers: null },
  enterprise: { users: null, activeDossiers: null },
}

// ---------- Organisation ----------

const EMPTY_PROFILE: CompanyProfile = { legalName: '', sector: '', niu: '', rccm: '', address: '', city: '', phone: '', email: '', website: '' }

export function CompanySection() {
  const { currentCompany, updateCompany } = useSuivix()
  const initial = { name: currentCompany.name, ...EMPTY_PROFILE, ...currentCompany.profile }
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entreprise</CardTitle>
        <CardDescription>Ces informations apparaissent sur les accusés de réception et les exports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-density-lg">
        <div className="flex items-center gap-4">
          {currentCompany.logo ? (
            <img src={currentCompany.logo} alt={`Logo ${currentCompany.name}`} className="h-20 w-20 rounded-lg border border-border bg-white object-contain p-1.5" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-ink text-xl font-semibold text-white">{initials(currentCompany.name)}</div>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <ImagePicker
                onPick={(logo) => {
                  updateCompany({ logo })
                  toast.success('Logo mis à jour')
                }}
              >
                <Photo className="h-4 w-4" /> {currentCompany.logo ? 'Changer le logo' : 'Ajouter un logo'}
              </ImagePicker>
              {currentCompany.logo && (
                <Button variant="ghost" size="sm" onClick={() => updateCompany({ logo: null })}>
                  Retirer
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Affiché dans l'en-tête et sur les accusés de réception.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-density-md sm:grid-cols-2">
          <Field label="Nom d'usage" htmlFor="c-name">
            <Input id="c-name" value={v.name} onChange={set('name')} />
          </Field>
          <Field label="Raison sociale" htmlFor="c-legal">
            <Input id="c-legal" value={v.legalName} onChange={set('legalName')} placeholder="Ex. Société Alpha SARL" />
          </Field>
          <Field label="Secteur d'activité" htmlFor="c-sector">
            <Input id="c-sector" value={v.sector} onChange={set('sector')} />
          </Field>
          <Field label="Site web" htmlFor="c-web">
            <Input id="c-web" value={v.website} onChange={set('website')} placeholder="entreprise.cm" />
          </Field>
          <Field label="NIU (numéro contribuable)" htmlFor="c-niu">
            <Input id="c-niu" className="font-mono" value={v.niu} onChange={set('niu')} />
          </Field>
          <Field label="RCCM" htmlFor="c-rccm">
            <Input id="c-rccm" className="font-mono" value={v.rccm} onChange={set('rccm')} placeholder="RC/YAO/2024/B/0000" />
          </Field>
          <Field label="Adresse" htmlFor="c-addr">
            <Input id="c-addr" value={v.address} onChange={set('address')} placeholder="Rue, quartier" />
          </Field>
          <Field label="Ville" htmlFor="c-city">
            <Input id="c-city" value={v.city} onChange={set('city')} placeholder="Yaoundé" />
          </Field>
          <Field label="Téléphone" htmlFor="c-phone">
            <Input id="c-phone" type="tel" value={v.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email de contact" htmlFor="c-email">
            <Input id="c-email" type="email" value={v.email} onChange={set('email')} />
          </Field>
        </div>
        <SaveBar
          dirty={dirty}
          onReset={() => setV(initial)}
          onSave={() => {
            if (!v.name.trim()) {
              toast.error("Le nom de l'entreprise est obligatoire.")
              return
            }
            const { name, ...profile } = v
            updateCompany({ name: name.trim(), profile })
            toast.success('Informations de l’entreprise enregistrées')
          }}
        />
      </CardContent>
    </Card>
  )
}

export function DossierRulesSection() {
  const { currentCompany, updateCompany, state } = useSuivix()
  const initial = companySettings(currentCompany)
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const prefixOk = /^[A-Z0-9]{2,6}$/.test(v.refPrefix)
  const example = `${v.refPrefix || 'SVX'}-${new Date().getFullYear()}-${(state.dossiers.length + 101).toString().padStart(4, '0')}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossiers et alertes</CardTitle>
        <CardDescription>Règles appliquées à tous les dossiers de l'entreprise.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-density-lg">
        <div className="grid grid-cols-1 gap-density-md sm:grid-cols-3">
          <Field label="Préfixe des références" htmlFor="r-prefix" hint={prefixOk ? `Prochain dossier : ${example}` : '2 à 6 lettres majuscules ou chiffres.'}>
            <Input id="r-prefix" className="font-mono uppercase" maxLength={6} value={v.refPrefix} onChange={(e) => setV({ ...v, refPrefix: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Alerte d'inactivité (jours)" htmlFor="r-idle" hint="Dossier sans mouvement depuis ce nombre de jours.">
            <Input id="r-idle" type="number" min={1} max={90} value={v.inactivityDays} onChange={(e) => setV({ ...v, inactivityDays: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <Field label="Alerte d'échéance (jours avant)" htmlFor="r-due" hint="Prévenir avant la date d'échéance.">
            <Input id="r-due" type="number" min={0} max={30} value={v.dueSoonDays} onChange={(e) => setV({ ...v, dueSoonDays: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        </div>
        <div className="space-y-density-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Types de dossiers et pièces requises</p>
              <p className="text-xs text-muted-foreground">Choisi à l'enregistrement : la liste des pièces apparaît sur l'accusé de réception et la page de suivi du client.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setV({ ...v, dossierTypes: [...v.dossierTypes, { id: `type-${Date.now().toString(36)}`, name: 'Nouveau type', pieces: [] }] })}
            >
              <Plus className="h-4 w-4" /> Ajouter un type
            </Button>
          </div>
          {v.dossierTypes.map((t, i) => (
            <div key={t.id} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1.4fr_auto]">
              <Input
                aria-label="Nom du type"
                value={t.name}
                onChange={(e) => setV({ ...v, dossierTypes: v.dossierTypes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <Textarea
                aria-label={`Pièces requises pour ${t.name}`}
                rows={Math.max(3, t.pieces.length)}
                className="text-sm"
                placeholder="Une pièce par ligne"
                value={t.pieces.join('\n')}
                onChange={(e) => setV({ ...v, dossierTypes: v.dossierTypes.map((x, j) => (j === i ? { ...x, pieces: e.target.value.split('\n') } : x)) })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Supprimer le type ${t.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setV({ ...v, dossierTypes: v.dossierTypes.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="rounded-md bg-muted/50 px-density-md py-density-sm text-sm">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Statuts utilisés</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(STATUS_CONFIG).map((s) => (
              <span key={s.label} className="rounded border border-border bg-card px-2 py-0.5 text-xs">
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <SaveBar
          dirty={dirty}
          onReset={() => setV(initial)}
          onSave={() => {
            if (!prefixOk) {
              toast.error('Préfixe invalide : 2 à 6 lettres majuscules ou chiffres.')
              return
            }
            // Blank lines and unnamed types are dropped; existing dossiers keep the pieces they were registered with.
            const dossierTypes = v.dossierTypes
              .map((t) => ({ ...t, name: t.name.trim(), pieces: t.pieces.map((p) => p.trim()).filter(Boolean) }))
              .filter((t) => t.name)
            updateCompany({ settings: { ...v, dossierTypes } })
            setV({ ...v, dossierTypes })
            toast.success('Règles enregistrées — elles s’appliquent aux nouveaux dossiers et aux alertes.')
          }}
        />
      </CardContent>
    </Card>
  )
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {used} / {limit ?? 'illimité'}
        </span>
      </div>
      <Progress value={limit ? Math.min(100, (used / limit) * 100) : 8} className="h-1.5" />
    </div>
  )
}

export function PlanSection() {
  const { currentCompany, currentMember, state } = useSuivix()
  const limits = PLAN_LIMITS[currentCompany.plan]
  const activeUsers = state.members.filter((m) => m.status === 'actif').length
  const activeDossiers = state.dossiers.filter((d) => d.status !== 'termine').length
  const isAdmin = currentMember.role === 'admin'

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Offre actuelle</CardTitle>
            <CardDescription>Client depuis le {formatDate(currentCompany.createdAt)}</CardDescription>
          </div>
          <Badge className="text-sm">{PLAN_LABELS[currentCompany.plan]}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-density-lg sm:grid-cols-2">
          <UsageRow label="Utilisateurs actifs" used={activeUsers} limit={limits.users} />
          <UsageRow label="Dossiers en circulation" used={activeDossiers} limit={limits.activeDossiers} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-density-lg xl:grid-cols-3">
        {PLAN_OFFERS.map((o) => {
          const current = o.plan === currentCompany.plan
          return (
            <Card key={o.plan} className={current ? 'border-primary ring-1 ring-primary' : ''}>
              <CardContent className="flex h-full flex-col gap-density-md p-density-lg">
                <div className="flex items-center justify-between">
                  <p className="eyebrow text-[0.65rem] text-muted-foreground">{o.name}</p>
                  {current && <Badge>Votre offre</Badge>}
                </div>
                <p>
                  <span className="text-2xl font-semibold">{o.price}</span>
                  <span className="ml-1.5 text-sm text-muted-foreground">{o.period}</span>
                </p>
                <ul className="flex-1 space-y-1.5">
                  {o.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {!current && isAdmin && (
                  <Button variant="outline" asChild>
                    <a href={mailtoLink('contact@suivix.co', `Passage à l'offre ${o.name}`, `Bonjour, je souhaite passer ${currentCompany.name} à l'offre ${o.name} de Suivix.`)}>
                      Passer à {o.name}
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Paiement par Orange Money, MTN MoMo ou virement. Facture émise au nom de la raison sociale renseignée dans « Entreprise ».</p>
    </>
  )
}

export function DataSection() {
  const { state, currentCompany, resetDemoData } = useSuivix()

  function exportCsv() {
    const holder = (id: string | null) => state.members.find((m) => m.id === id)?.name ?? ''
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [
      ['reference', 'objet', 'entreprise', 'statut', 'detenteur', 'emplacement', 'enregistre_le', 'mis_a_jour_le'],
      ...state.dossiers.map((d) => [d.reference, d.title, d.client, STATUS_CONFIG[d.status].label, holder(d.agentId), d.physicalLocation ?? '', d.createdAt.slice(0, 10), d.updatedAt.slice(0, 10)]),
    ]
    const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `suivix-${currentCompany.slug}-dossiers.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Exporter les dossiers</CardTitle>
          <CardDescription>Tous les dossiers de l'entreprise au format CSV, lisible dans Excel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Exporter {state.dossiers.length} dossier{state.dossiers.length > 1 ? 's' : ''}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Effacer les données de cet appareil</CardTitle>
          <CardDescription>Supprime les espaces, dossiers et comptes enregistrés dans ce navigateur, puis recharge l'espace de démonstration.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Effacer les données
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Effacer toutes les données de cet appareil ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action est définitive. Exportez vos dossiers avant si vous souhaitez les conserver.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={resetDemoData}>
                  Effacer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  )
}
