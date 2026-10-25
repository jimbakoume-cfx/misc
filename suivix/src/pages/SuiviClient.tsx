import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconCircleCheck as CheckCircle, IconClock as Clock, IconMail as Mail, IconPhone as Phone, IconSearch as Search } from '@tabler/icons-react'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { useSuivix } from '../lib/suivix/context'
import { clientProgress, formatDate, formatDateTime, initials, missingPieces } from '../lib/suivix/utils'
import type { Company, Dossier } from '../lib/suivix/types'
import { SuivixLogo } from '../components/suivix/Logo'

const STEPS = ['Reçu', 'En traitement', 'Terminé']

// Public page opened from the QR code on the accusé de réception: the depositor sees where their
// dossier stands without calling or coming back to the office. No internal notes are shown.
export default function SuiviClient() {
  const { reference = '' } = useParams<{ reference: string }>()
  const { companies, dataByCompany } = useSuivix()
  const navigate = useNavigate()
  const [query, setQuery] = useState(reference)

  let found: { dossier: Dossier; companyId: string } | null = null
  for (const [companyId, data] of Object.entries(dataByCompany)) {
    const dossier = data.dossiers.find((d) => d.reference.toLowerCase() === reference.toLowerCase())
    if (dossier) {
      found = { dossier, companyId }
      break
    }
  }
  const company = found ? companies.find((c) => c.id === found!.companyId) : null

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-14">
      <div className="mx-auto w-full max-w-lg space-y-5">
        {company && found ? (
          <ClientView dossier={found.dossier} company={company} />
        ) : (
          <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-retool-sm">
            <div>
              <p className="eyebrow mb-1.5 text-primary">Suivi de dossier</p>
              <h1 className="text-xl font-semibold tracking-tight">{reference ? `Référence ${reference} introuvable` : 'Suivre votre dossier'}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Saisissez la référence indiquée sur votre accusé de réception.</p>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) navigate(`/suivi/${encodeURIComponent(query.trim().toUpperCase())}`)
              }}
            >
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex. SVX-2026-0103" className="font-mono uppercase" aria-label="Référence du dossier" />
              <Button type="submit">
                <Search className="h-4 w-4" /> Suivre
              </Button>
            </form>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          Suivi assuré avec <SuivixLogo size="sm" />
        </div>
      </div>
    </div>
  )
}

function ClientView({ dossier, company }: { dossier: Dossier; company: Company }) {
  const progress = clientProgress(dossier)
  const missing = missingPieces(dossier)
  const pieces = dossier.pieces ?? []

  return (
    <>
      <div className="flex items-center gap-3">
        {company.logo ? (
          <img src={company.logo} alt="" className="h-12 w-12 rounded-md border border-border bg-white object-contain p-1" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-ink text-sm font-semibold text-white">{initials(company.name)}</div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{company.profile?.legalName || company.name}</p>
          <p className="text-xs text-muted-foreground">Suivi de votre dossier</p>
        </div>
      </div>

      <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-retool-sm sm:p-6">
        <div>
          <p className="ref text-muted-foreground">{dossier.reference}</p>
          <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight">{dossier.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Déposé le {formatDate(dossier.createdAt)} · {dossier.client}</p>
        </div>

        <ol className="grid grid-cols-3 gap-2" aria-label="Avancement">
          {STEPS.map((label, i) => {
            const done = i < progress.step || progress.step === 2
            const current = i === progress.step && progress.step !== 2
            return (
              <li key={label} className="space-y-1.5">
                <span className={`block h-1.5 rounded-full ${done ? 'bg-success' : current ? 'bg-primary' : 'bg-muted'}`} />
                <span className={`block text-xs ${done || current ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              </li>
            )
          })}
        </ol>

        <div className={`flex items-start gap-3 rounded-md px-4 py-3 ${progress.step === 2 ? 'bg-success/10' : missing.length ? 'bg-warning/10' : 'bg-accent'}`}>
          {progress.step === 2 ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <Clock className={`mt-0.5 h-5 w-5 shrink-0 ${missing.length ? 'text-warning' : 'text-primary'}`} />}
          <div>
            <p className="font-semibold">{progress.label}</p>
            <p className="text-sm text-muted-foreground">{progress.next}</p>
          </div>
        </div>

        {pieces.length > 0 && dossier.status !== 'termine' && (
          <div>
            <p className="mb-2 text-sm font-medium">
              Pièces du dossier · {pieces.length - missing.length} / {pieces.length} reçues
            </p>
            <ul className="space-y-1.5">
              {pieces.map((p) => (
                <li key={p.name} className="flex items-start gap-2 text-sm">
                  {p.received ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-warning" />}
                  <span className={p.received ? 'text-muted-foreground' : 'font-medium'}>{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">Dernière mise à jour : {formatDateTime(dossier.updatedAt)}</p>
      </div>

      {(company.profile?.phone || company.profile?.email) && (
        <div className="rounded-lg border border-border bg-card px-5 py-4 text-sm">
          <p className="mb-2 font-medium">Une question ? Citez votre référence.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-muted-foreground">
            {company.profile?.phone && (
              <a href={`tel:${company.profile.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Phone className="h-4 w-4" /> {company.profile.phone}
              </a>
            )}
            {company.profile?.email && (
              <a href={`mailto:${company.profile.email}?subject=${encodeURIComponent(`Dossier ${dossier.reference}`)}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Mail className="h-4 w-4" /> {company.profile.email}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
