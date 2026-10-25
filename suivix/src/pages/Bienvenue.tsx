import { useState } from 'react'
import { IconArrowRight as ArrowRight, IconBuilding as Building2, IconChevronLeft as ChevronLeft, IconSparkles as Sparkles } from '@tabler/icons-react'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import { useSuivix } from '../lib/suivix/context'
import { initials, PLAN_LABELS, ROLE_CONFIG, ROLE_ORDER } from '../lib/suivix/utils'
import { MemberAvatar } from '../components/suivix/Badges'
import { SuivixLogo } from '../components/suivix/Logo'

type Step = 'workspaces' | 'members' | 'create'

// Welcome, sign-in and workspace creation. Without a backend, signing in means choosing who you are
// in a workspace stored in this browser; real authentication comes with the online version.
export default function Bienvenue() {
  const { companies, signIn, createCompany } = useSuivix()
  const [step, setStep] = useState<Step>(companies.length > 0 ? 'workspaces' : 'create')
  const [companyId, setCompanyId] = useState<string>('')

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <SuivixLogo size="lg" tagline tone="ink" />
        <div className="space-y-6">
          <h1 className="text-[2.4rem] font-semibold leading-tight tracking-tight">
            Sachez à tout moment qui détient chaque dossier, où il se trouve et où il en est.
          </h1>
          <ol className="flex items-center gap-0" aria-label="Enregistrer, pointer, retrouver">
            {['Enregistrer', 'Pointer', 'Retrouver'].map((label, i) => (
              <li key={label} className="flex flex-1 flex-col gap-2">
                <span className="flex items-center">
                  <span className="h-3 w-3 shrink-0 bg-primary" />
                  {i < 2 && <span className="h-[2px] flex-1 bg-primary" />}
                </span>
                <span className="eyebrow text-[0.65rem] text-white/70">{label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="font-mono text-xs text-white/40">suivix.co</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="animate-rise w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <SuivixLogo tagline />
          </div>

          {step === 'workspaces' && (
            <WorkspaceStep
              onPick={(id) => {
                setCompanyId(id)
                setStep('members')
              }}
              onCreate={() => setStep('create')}
            />
          )}
          {step === 'members' && (
            <MemberStep companyId={companyId} onBack={() => setStep('workspaces')} onPick={(memberId) => signIn(companyId, memberId)} />
          )}
          {step === 'create' && <CreateStep canGoBack={companies.length > 0} onBack={() => setStep('workspaces')} onCreate={createCompany} />}
        </div>
      </main>
    </div>
  )
}

function WorkspaceStep({ onPick, onCreate }: { onPick: (id: string) => void; onCreate: () => void }) {
  const { companies } = useSuivix()
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1.5 text-primary">Connexion</p>
        <h2 className="text-2xl font-semibold tracking-tight">Choisissez votre espace</h2>
        <p className="mt-1 font-editorial text-muted-foreground">Les espaces enregistrés sur cet appareil.</p>
      </div>
      <ul className="space-y-2">
        {companies.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onPick(c.id)}
              className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-retool-sm transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink text-xs font-semibold text-white">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="eyebrow text-[0.6rem] text-primary">{PLAN_LABELS[c.plan]}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="w-full" onClick={onCreate}>
        <Sparkles className="h-4 w-4" /> Créer l'espace de mon entreprise
      </Button>
    </div>
  )
}

function MemberStep({ companyId, onBack, onPick }: { companyId: string; onBack: () => void; onPick: (memberId: string) => void }) {
  const { companies, dataByCompany } = useSuivix()
  const company = companies.find((c) => c.id === companyId)
  const members = (dataByCompany[companyId]?.members ?? []).filter((m) => m.status === 'actif')
  const sorted = [...members].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Autres espaces
      </button>
      <div>
        <p className="eyebrow mb-1.5 text-primary">{company?.name}</p>
        <h2 className="text-2xl font-semibold tracking-tight">Qui êtes-vous ?</h2>
        <p className="mt-1 font-editorial text-muted-foreground">Chaque compte voit son propre tableau de bord.</p>
      </div>
      <ul className="scrollbar-thin max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {sorted.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => onPick(m.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <MemberAvatar name={m.name} color={m.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ROLE_CONFIG[m.role].label}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CreateStep({
  canGoBack,
  onBack,
  onCreate,
}: {
  canGoBack: boolean
  onBack: () => void
  onCreate: (input: { companyName: string; adminName: string; email: string; phone: string }) => void
}) {
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const valid = companyName.trim() && adminName.trim() && (email.trim() || phone.trim())

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onCreate({ companyName: companyName.trim(), adminName: adminName.trim(), email: email.trim(), phone: phone.trim() })
      }}
    >
      {canGoBack && (
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Espaces existants
        </button>
      )}
      <div>
        <p className="eyebrow mb-1.5 text-primary">Gratuit · Plan Découverte</p>
        <h2 className="text-2xl font-semibold tracking-tight">Créez l'espace de votre entreprise</h2>
        <p className="mt-1 font-editorial text-muted-foreground">Vous en serez l'administrateur et pourrez inviter votre équipe.</p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="co-name">Nom de l'entreprise</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="co-name" className="pl-9" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex. Cabinet Mbarga & Associés" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-admin">Votre nom</Label>
          <Input id="co-admin" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Prénom et nom" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="co-phone">Téléphone</Label>
            <Input id="co-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XX XX XX XX" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-email">Email</Label>
            <Input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@entreprise.cm" />
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={!valid}>
        Créer mon espace <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  )
}
