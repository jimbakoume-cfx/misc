import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconBell as Bell,
  IconBuilding as Building2,
  IconCreditCard as CreditCard,
  IconDatabase as Database,
  IconFolders as Folders,
  IconLock as Lock,
  IconPhoto as Photo,
  IconUser as User,
} from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Checkbox } from '../lib/shadcn/checkbox'
import { useSuivix } from '../lib/suivix/context'
import { formatDate, ROLE_CONFIG } from '../lib/suivix/utils'
import type { NotifyEvent } from '../lib/suivix/types'
import { toast } from '../lib/shadcn/sonner'
import { PageHeader } from '../components/suivix/PageHeader'
import { MemberAvatar } from '../components/suivix/Badges'
import { Field, ImagePicker, SaveBar } from '../components/suivix/SettingsFields'
import { CompanySection, DataSection, DossierRulesSection, PlanSection } from './ParametresOrganisation'

type Section = 'profil' | 'securite' | 'notifications' | 'entreprise' | 'dossiers' | 'offre' | 'donnees'


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
