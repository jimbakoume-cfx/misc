import { useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconBell as Bell,
  IconBuilding as Building2,
  IconCheck as Check,
  IconCreditCard as CreditCard,
  IconDatabase as Database,
  IconDownload as Download,
  IconFolders as Folders,
  IconLock as Lock,
  IconPhoto as Photo,
  IconTrash as Trash2,
  IconUser as User,
} from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import { Checkbox } from '../lib/shadcn/checkbox'
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
import { companySettings, formatDate, initials, PLAN_LABELS, PLAN_OFFERS, ROLE_CONFIG, STATUS_CONFIG, mailtoLink } from '../lib/suivix/utils'
import type { CompanyProfile, NotifyEvent, Plan } from '../lib/suivix/types'
import { toast } from '../lib/shadcn/sonner'
import { PageHeader } from '../components/suivix/PageHeader'
import { MemberAvatar } from '../components/suivix/Badges'

type Section = 'profil' | 'securite' | 'notifications' | 'entreprise' | 'dossiers' | 'offre' | 'donnees'

// Usage limits per offer, as sold in the commercial deck (null = unlimited).
const PLAN_LIMITS: Record<Plan, { users: number | null; activeDossiers: number | null }> = {
  starter: { users: 3, activeDossiers: 50 },
  pro: { users: 15, activeDossiers: null },
  enterprise: { users: null, activeDossiers: null },
}

export default function Parametres() {
  const { currentMember } = useSuivix()
  const [params, setParams] = useSearchParams()
  const isAdmin = currentMember.role === 'admin'

  const sections: { id: Section; label: string; icon: ReactNode; group: string; show: boolean }[] = [
    { id: 'profil', label: 'Mon profil', icon: <User className="h-4 w-4" />, group: 'Mon compte', show: true },
    { id: 'securite', label: 'Sécurité', icon: <Lock className="h-4 w-4" />, group: 'Mon compte', show: true },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" />, group: 'Mon compte', show: true },
    { id: 'entreprise', label: 'Entreprise', icon: <Building2 className="h-4 w-4" />, group: 'Organisation', show: isAdmin },
    { id: 'dossiers', label: 'Dossiers et alertes', icon: <Folders className="h-4 w-4" />, group: 'Organisation', show: isAdmin },
    { id: 'offre', label: 'Offre et facturation', icon: <CreditCard className="h-4 w-4" />, group: 'Organisation', show: isAdmin || currentMember.role === 'directeur' },
    { id: 'donnees', label: 'Données', icon: <Database className="h-4 w-4" />, group: 'Organisation', show: isAdmin },
  ]
  const visible = sections.filter((s) => s.show)
  const requested = params.get('section') as Section | null
  const active = visible.find((s) => s.id === requested)?.id ?? 'profil'
  const groups = [...new Set(visible.map((s) => s.group))]

  return (
    <div className="space-y-density-lg">
      <PageHeader eyebrow="Administration" title="Paramètres" subtitle="Votre compte, votre entreprise et vos préférences." />

      <div className="grid grid-cols-1 gap-density-xl lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible" aria-label="Sections des paramètres">
          {groups.map((g) => (
            <div key={g} className="flex gap-1 lg:flex-col">
              <p className="eyebrow hidden px-2.5 pb-1 text-[0.6rem] text-muted-foreground lg:block">{g}</p>
              {visible
                .filter((s) => s.group === g)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setParams({ section: s.id })}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                      active === s.id ? 'bg-card text-foreground shadow-retool-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span className={active === s.id ? 'text-primary' : ''}>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div key={active} className="animate-rise min-w-0 space-y-density-lg">
          {active === 'profil' && <ProfileSection />}
          {active === 'securite' && <SecuritySection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'entreprise' && <CompanySection />}
          {active === 'dossiers' && <DossierRulesSection />}
          {active === 'offre' && <PlanSection />}
          {active === 'donnees' && <DataSection />}
        </div>
      </div>
    </div>
  )
}

// ---------- Building blocks ----------

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-density-md">
      {dirty && <span className="mr-auto text-xs text-muted-foreground">Modifications non enregistrées</span>}
      <Button variant="ghost" disabled={!dirty} onClick={onReset}>
        Annuler
      </Button>
      <Button disabled={!dirty} onClick={onSave}>
        Enregistrer
      </Button>
    </div>
  )
}

// Reads an image and downsizes it so it fits comfortably in browser storage.
function readImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function ImagePicker({ onPick, children }: { onPick: (dataUrl: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (f.size > 5_000_000) {
            toast.error('Image trop lourde (5 Mo maximum).')
            return
          }
          try {
            onPick(await readImage(f))
          } catch {
            toast.error('Impossible de lire cette image.')
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  )
}

// ---------- Mon compte ----------

function ProfileSection() {
  const { currentMember, updateMember } = useSuivix()
  const initial = { name: currentMember.name, jobTitle: currentMember.jobTitle ?? '', email: currentMember.email, phone: currentMember.phone === '—' ? '' : currentMember.phone }
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mon profil</CardTitle>
        <CardDescription>Ces informations sont visibles par votre équipe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-density-lg">
        <div className="flex items-center gap-4">
          <MemberAvatar name={currentMember.name} color={currentMember.color} src={currentMember.avatar} size="xl" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <ImagePicker
                onPick={(avatar) => {
                  updateMember(currentMember.id, { avatar })
                  toast.success('Photo de profil mise à jour')
                }}
              >
                <Photo className="h-4 w-4" /> Changer la photo
              </ImagePicker>
              {currentMember.avatar && (
                <Button variant="ghost" size="sm" onClick={() => updateMember(currentMember.id, { avatar: null })}>
                  Retirer
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG ou JPG, format carré de préférence.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-density-md sm:grid-cols-2">
          <Field label="Nom complet" htmlFor="p-name">
            <Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Fonction" htmlFor="p-job">
            <Input id="p-job" value={v.jobTitle} onChange={(e) => setV({ ...v, jobTitle: e.target.value })} placeholder="Ex. Responsable courrier" />
          </Field>
          <Field label="Email" htmlFor="p-email">
            <Input id="p-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="Téléphone" htmlFor="p-phone">
            <Input id="p-phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="+237 6XX XX XX XX" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-md bg-muted/50 px-density-md py-density-sm text-sm">
          <span>
            <span className="text-muted-foreground">Type de compte : </span>
            {ROLE_CONFIG[currentMember.role].label}
          </span>
          <span>
            <span className="text-muted-foreground">Membre depuis le </span>
            {formatDate(currentMember.createdAt)}
          </span>
        </div>
        <SaveBar
          dirty={dirty}
          onReset={() => setV(initial)}
          onSave={() => {
            if (!v.name.trim()) {
              toast.error('Le nom est obligatoire.')
              return
            }
            updateMember(currentMember.id, { name: v.name.trim(), jobTitle: v.jobTitle.trim(), email: v.email.trim(), phone: v.phone.trim() || '—' })
            toast.success('Profil enregistré')
          }}
        />
      </CardContent>
    </Card>
  )
}

function SecuritySection() {
  const { signOut } = useSuivix()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const tooShort = next.length > 0 && next.length < 8
  const mismatch = confirm.length > 0 && next !== confirm
  const canSave = current && next.length >= 8 && next === confirm

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>8 caractères minimum. Choisissez un mot de passe que vous n'utilisez nulle part ailleurs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-density-md">
          <div className="grid grid-cols-1 gap-density-md sm:max-w-md">
            <Field label="Mot de passe actuel" htmlFor="s-cur">
              <Input id="s-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="Nouveau mot de passe" htmlFor="s-new" hint={tooShort ? 'Trop court : 8 caractères minimum.' : undefined}>
              <Input id="s-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label="Confirmer le nouveau mot de passe" htmlFor="s-conf" hint={mismatch ? 'Les deux mots de passe ne correspondent pas.' : undefined}>
              <Input id="s-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end border-t border-border pt-density-md">
            <Button
              disabled={!canSave}
              onClick={() => {
                setCurrent('')
                setNext('')
                setConfirm('')
                toast.success('Mot de passe modifié')
              }}
            >
              Mettre à jour le mot de passe
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Appareils actuellement connectés à votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-density-md">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-density-md py-density-sm">
            <div>
              <p className="text-sm font-medium">Cet appareil</p>
              <p className="text-xs text-muted-foreground">{navigator.userAgent.includes('Mobile') ? 'Téléphone' : 'Ordinateur'} · actif maintenant</p>
            </div>
            <Badge variant="success">Session actuelle</Badge>
          </div>
          <Button variant="outline" onClick={signOut}>
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </>
  )
}

const NOTIFY_EVENTS: { id: NotifyEvent; label: string; hint: string }[] = [
  { id: 'assignment', label: 'Un dossier m’est transmis', hint: 'Dès qu’un transfert vous désigne comme détenteur.' },
  { id: 'blocked', label: 'Un de mes dossiers est bloqué', hint: 'Avec le motif du blocage.' },
  { id: 'due', label: 'Une échéance approche ou est dépassée', hint: 'Sur les dossiers que vous détenez.' },
  { id: 'task', label: 'Une tâche m’est assignée', hint: 'Avec le dossier concerné.' },
]

function NotificationsSection() {
  const { currentMember, updateMember } = useSuivix()
  const prefs = { assignment: true, blocked: true, due: true, task: true, ...currentMember.notifyOn }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choisissez pour quoi Suivix vous prévient.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-density-lg">
        <p className="rounded-md bg-muted/50 px-density-md py-density-sm text-sm">
          Les alertes vous sont envoyées par email à <span className="font-medium">{currentMember.email}</span> et restent visibles dans la cloche de notifications.
        </p>
        <div className="divide-y divide-border rounded-md border border-border">
          {NOTIFY_EVENTS.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-start gap-3 px-density-md py-density-sm">
              <Checkbox
                className="mt-0.5"
                checked={prefs[e.id]}
                onCheckedChange={(checked) => updateMember(currentMember.id, { notifyOn: { ...prefs, [e.id]: checked === true } })}
              />
              <span>
                <span className="block text-sm font-medium">{e.label}</span>
                <span className="block text-xs text-muted-foreground">{e.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Organisation ----------

const EMPTY_PROFILE: CompanyProfile = { legalName: '', sector: '', niu: '', rccm: '', address: '', city: '', phone: '', email: '', website: '' }

function CompanySection() {
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

function DossierRulesSection() {
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
            updateCompany({ settings: v })
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

function PlanSection() {
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

function DataSection() {
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
