import type {
  Company,
  CompanySettings,
  Dossier,
  DossierStatus,
  Member,
  Plan,
  Priority,
  Role,
  Task,
} from './types'

// ---------- Formatting ----------

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function daysBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

export function daysSince(iso: string): number {
  return daysBetween(iso, new Date().toISOString())
}

// ---------- Status / priority display config ----------

export const STATUS_CONFIG: Record<DossierStatus, { label: string; badge: 'default' | 'secondary' | 'destructive' | 'warning' | 'success' | 'outline' }> = {
  nouveau: { label: 'Nouveau', badge: 'outline' },
  en_cours: { label: 'En cours', badge: 'default' },
  en_attente: { label: 'En attente', badge: 'secondary' },
  bloque: { label: 'Bloqué', badge: 'destructive' },
  termine: { label: 'Terminé', badge: 'success' },
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; badge: 'default' | 'secondary' | 'destructive' | 'warning' | 'success' | 'outline' }> = {
  basse: { label: 'Basse', badge: 'outline' },
  normale: { label: 'Normale', badge: 'secondary' },
  haute: { label: 'Haute', badge: 'warning' },
  urgente: { label: 'Urgente', badge: 'destructive' },
}

export const ROLE_CONFIG: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Administrateur', description: 'Gère le compte, les utilisateurs, les paramètres et a accès à tout.' },
  directeur: { label: 'Directeur', description: "Vue d'ensemble de l'activité, des blocages et de la charge de l'équipe." },
  chef_service: { label: 'Chef de service', description: 'Pilote les dossiers de son service et les répartit entre collaborateurs.' },
  collaborateur: { label: 'Collaborateur', description: 'Traite les dossiers qui lui sont confiés et pointe les transferts.' },
  secretariat: { label: 'Secrétariat / Courrier', description: 'Enregistre les dossiers entrants, les oriente et sait où ils se trouvent.' },
}

export const ROLE_ORDER: Role[] = ['admin', 'directeur', 'chef_service', 'collaborateur', 'secretariat']

export const PLAN_LABELS: Record<Plan, string> = {
  starter: 'Plan Découverte',
  pro: 'Plan Essentiel',
  enterprise: 'Plan Entreprise',
}

// The three offers from the commercial deck. Payment is handled by the Suivix team for now.
export const PLAN_OFFERS: { plan: Plan; name: string; price: string; period: string; features: string[] }[] = [
  {
    plan: 'starter',
    name: 'Découverte',
    price: 'Gratuit',
    period: 'pour essayer',
    features: ["Jusqu'à 3 utilisateurs", '50 dossiers actifs', 'Pièces jointes et tâches', 'Formation : tutoriels vidéo'],
  },
  {
    plan: 'pro',
    name: 'Essentiel',
    price: '49 500 FCFA',
    period: 'par mois',
    features: ["Jusqu'à 15 utilisateurs", 'Dossiers illimités, 5 rôles', 'Alertes par email, étiquettes QR', 'Formation : session de 2 h en ligne'],
  },
  {
    plan: 'enterprise',
    name: 'Entreprise',
    price: '99 500 FCFA',
    period: 'par mois',
    features: ['Utilisateurs illimités', 'Multi-sites', 'Support prioritaire', 'Formation : demi-journée sur site'],
  },
]

// mailto link with a prefilled subject and body, opened in the user's mail app.
export function mailtoLink(to: string | null | undefined, subject: string, body: string): string {
  return `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const AVATAR_COLOR_CLASSES: Record<string, string> = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ---------- Permissions ----------

export function canManageTeam(role: Role): boolean {
  return role === 'admin'
}

export function canViewTeam(role: Role): boolean {
  return role === 'admin' || role === 'directeur' || role === 'chef_service'
}

// Register new dossiers: everyone except collaborateurs (the secrétariat is the front door).
export function canCreateDossier(role: Role): boolean {
  return role !== 'collaborateur'
}

// Edit any dossier (collaborateurs can still edit the dossiers they hold).
export function canManageDossiers(role: Role): boolean {
  return role === 'admin' || role === 'directeur' || role === 'chef_service'
}

export function canDeleteDossier(role: Role): boolean {
  return role === 'admin'
}

export function canAssignDossier(role: Role): boolean {
  return role !== 'collaborateur'
}

export function canManageSettings(role: Role): boolean {
  return role === 'admin'
}

// Members who can hold and process a dossier.
export function isHolderRole(role: Role): boolean {
  return role === 'chef_service' || role === 'collaborateur'
}

export function visibleDossiersFor(member: Member, dossiers: Dossier[]): Dossier[] {
  if (member.role === 'collaborateur') return dossiers.filter((d) => d.agentId === member.id)
  return dossiers
}

// ---------- Alerts ----------

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface AlertItem {
  id: string
  dossierId: string
  severity: AlertSeverity
  type: 'stagnation' | 'echeance' | 'blocage'
  message: string
}

export const DEFAULT_SETTINGS: CompanySettings = { refPrefix: 'SVX', inactivityDays: 7, dueSoonDays: 3 }

export function companySettings(company: Company): CompanySettings {
  return { ...DEFAULT_SETTINGS, ...company.settings }
}

export function computeAlerts(dossiers: Dossier[], settings: Pick<CompanySettings, 'inactivityDays' | 'dueSoonDays'> = DEFAULT_SETTINGS): AlertItem[] {
  const STAGNATION_THRESHOLD_DAYS = settings.inactivityDays
  const ECHEANCE_WARNING_DAYS = settings.dueSoonDays
  const alerts: AlertItem[] = []
  for (const d of dossiers) {
    if (d.status === 'termine') continue

    const idle = daysSince(d.updatedAt)
    if (idle >= STAGNATION_THRESHOLD_DAYS) {
      alerts.push({
        id: `stag-${d.id}`,
        dossierId: d.id,
        severity: idle >= STAGNATION_THRESHOLD_DAYS * 2 ? 'critical' : 'warning',
        type: 'stagnation',
        message: `${d.reference} — sans mouvement depuis ${idle} jours`,
      })
    }

    if (d.dueDate) {
      const daysToDue = daysBetween(new Date().toISOString(), d.dueDate)
      if (daysToDue < 0) {
        alerts.push({
          id: `due-${d.id}`,
          dossierId: d.id,
          severity: 'critical',
          type: 'echeance',
          message: `${d.reference} — échéance dépassée depuis ${Math.abs(daysToDue)} jours`,
        })
      } else if (daysToDue <= ECHEANCE_WARNING_DAYS) {
        alerts.push({
          id: `due-${d.id}`,
          dossierId: d.id,
          severity: 'warning',
          type: 'echeance',
          message: `${d.reference} — échéance dans ${daysToDue} jour${daysToDue === 1 ? '' : 's'}`,
        })
      }
    }

    if (d.status === 'bloque') {
      alerts.push({
        id: `block-${d.id}`,
        dossierId: d.id,
        severity: 'critical',
        type: 'blocage',
        message: `${d.reference} — bloqué : ${d.blockReason ?? 'motif non renseigné'}`,
      })
    }
  }
  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}

function severityRank(s: AlertSeverity): number {
  return s === 'critical' ? 2 : s === 'warning' ? 1 : 0
}

// ---------- Agent scorecards ----------

export interface AgentScorecard {
  member: Member
  total: number
  enCours: number
  bloque: number
  termine: number
  enRetard: number
  tauxCompletion: number
  delaiMoyen: number
}

export function computeAgentScorecard(member: Member, dossiers: Dossier[]): AgentScorecard {
  const mine = dossiers.filter((d) => d.agentId === member.id)
  const finished = mine.filter((d) => d.status === 'termine')
  const enRetard = mine.filter((d) => d.status !== 'termine' && d.dueDate && daysBetween(new Date().toISOString(), d.dueDate) < 0).length
  return {
    member,
    total: mine.length,
    enCours: mine.filter((d) => d.status === 'en_cours' || d.status === 'nouveau' || d.status === 'en_attente').length,
    bloque: mine.filter((d) => d.status === 'bloque').length,
    termine: finished.length,
    enRetard,
    tauxCompletion: mine.length > 0 ? Math.round((finished.length / mine.length) * 100) : 0,
    delaiMoyen: finished.length > 0 ? Math.round(finished.reduce((s, d) => s + daysBetween(d.createdAt, d.updatedAt), 0) / finished.length) : 0,
  }
}

export function openTasksCount(tasks: Task[], dossierId: string): number {
  return tasks.filter((t) => t.dossierId === dossierId && !t.done).length
}
