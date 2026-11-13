// Core domain types for Suivix — a mocked, frontend-only document/dossier tracking app.
// All data is seeded and persisted to localStorage; there is no real backend.

// Five account types modelled on how Cameroonian SMEs are organised:
// administrateur, direction, chef de service, collaborateur and secrétariat / bureau courrier.
export type Role = 'admin' | 'directeur' | 'chef_service' | 'collaborateur' | 'secretariat'

export type MemberStatus = 'actif' | 'en_attente'


export interface Member {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  status: MemberStatus
  color: string // tailwind color class suffix used for avatar background
  createdAt: string // ISO date
  avatar?: string | null // data URL of the profile photo
  jobTitle?: string
  notifyOn?: Partial<Record<NotifyEvent, boolean>>
}

export type NotifyEvent = 'assignment' | 'blocked' | 'due' | 'task'

export type DossierStatus = 'nouveau' | 'en_cours' | 'en_attente' | 'bloque' | 'termine'

export type Priority = 'basse' | 'normale' | 'haute' | 'urgente'

export interface Dossier {
  id: string
  reference: string
  title: string
  client: string
  description: string
  status: DossierStatus
  priority: Priority
  agentId: string | null
  tags: string[]
  createdAt: string // ISO date
  updatedAt: string // ISO date
  dueDate: string | null // ISO date
  blockReason: string | null
  physicalLocation: string | null // e.g. "Archives - Salle B - Étagère 4" (paper/digital bridge)
  clientEmail?: string | null // depositor's email, used to send the receipt
  typeId?: string | null // dossier type, which sets the required pieces
  pieces?: RequiredPiece[] // pieces the client must provide, copied from the type at registration
}

export interface RequiredPiece {
  name: string
  received: boolean
}

// A kind of dossier the company handles, with the pieces a client must provide for it.
export interface DossierType {
  id: string
  name: string
  pieces: string[]
}

// Décharge: proof that a dossier was handed from one person to another, optionally signed by the receiver.
export interface Handover {
  id: string
  dossierId: string
  fromId: string | null
  toId: string
  date: string // ISO date
  location: string | null
  note: string | null
  signature: string | null // data URL of the receiver's signature
  recordedBy: string
}

export type HistoryEventType =
  | 'creation'
  | 'status_change'
  | 'assignment'
  | 'attachment'
  | 'task'
  | 'comment'
  | 'update'
  | 'physical_move'

export interface HistoryEntry {
  id: string
  dossierId: string
  date: string // ISO date
  type: HistoryEventType
  description: string
  authorId: string | null
}

export type AttachmentType = 'pdf' | 'word'

export interface Attachment {
  id: string
  dossierId: string
  name: string
  fileType: AttachmentType
  size: number // bytes
  uploadedAt: string // ISO date
  uploadedBy: string | null
  taskId?: string | null // set when the file was attached to a specific task
}

export interface Task {
  id: string
  dossierId: string
  title: string
  done: boolean
  dueDate: string | null
  assigneeId: string | null
  createdAt: string // ISO date
}

export type KpiMetric =
  | 'volume_traite'
  | 'delai_moyen'
  | 'taux_blocage'
  | 'dossiers_en_retard'
  | 'taux_completion'

export type KpiPeriod = '7j' | '30j' | '90j' | 'tout'

export interface KpiDefinition {
  id: string
  name: string
  metric: KpiMetric
  period: KpiPeriod
  weight: number // 0-100
  createdAt: string
}

// Simulated email alerts — see lib/suivix/notifications.ts
export interface AppNotification {
  id: string
  memberId: string
  dossierId: string | null
  message: string
  sentAt: string // ISO date
  read: boolean
}

export interface SuivixState {
  members: Member[]
  dossiers: Dossier[]
  history: HistoryEntry[]
  attachments: Attachment[]
  tasks: Task[]
  kpiDefinitions: KpiDefinition[]
  notifications: AppNotification[]
  handovers: Handover[]
}

// ---------- Multi-tenant (SaaS) ----------

export type Plan = 'starter' | 'pro' | 'enterprise'

export interface CompanyProfile {
  legalName: string // raison sociale
  sector: string
  niu: string // numéro d'identifiant unique (contribuable)
  rccm: string // registre du commerce
  address: string
  city: string
  phone: string
  email: string
  website: string
}

export interface CompanySettings {
  refPrefix: string // dossier references read <prefix>-<year>-<number>
  inactivityDays: number // a dossier with no movement for this long raises an alert
  dueSoonDays: number // warn this many days before a due date
  dossierTypes: DossierType[]
}

export interface Company {
  id: string
  name: string
  slug: string
  plan: Plan
  createdAt: string // ISO date
  logo?: string | null // data URL of the uploaded logo
  profile?: Partial<CompanyProfile>
  settings?: Partial<CompanySettings>
}

// Root shape persisted to localStorage: one isolated SuivixState per company
// (tenant), plus which company/member is currently selected for the demo.
export interface SuivixRoot {
  companies: Company[]
  currentCompanyId: string
  dataByCompany: Record<string, SuivixState>
  currentMemberIdByCompany: Record<string, string>
  signedIn?: boolean // false/absent shows the welcome and sign-in screen
}
