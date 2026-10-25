import type {
  AppNotification,
  Attachment,
  Company,
  Dossier,
  DossierStatus,
  HistoryEntry,
  KpiDefinition,
  Member,
  MemberStatus,
  NotificationChannel,
  Plan,
  Priority,
  Role,
  SuivixState,
} from './types'
import { craftAssignmentMessage } from './notifications'

const STATUS_LABELS: Record<DossierStatus, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  en_attente: 'En attente',
  bloque: 'Bloqué',
  termine: 'Terminé',
}

// Deterministic PRNG so the seed dataset looks the same on every fresh browser/session.
function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLIENTS = [
  'Ministère de la Transition Écologique',
  'Préfecture d’Abidjan',
  'Groupe Aurex Industries',
  'Mairie de Dakar',
  'CHU de Cocody',
  'Banque Panafricaine Meridia',
  'SCI Les Baobabs',
  'Fondation Horizon Sahel',
  'Assurances Vertes CI',
  'Cabinet Notarial Kouassi',
  'Port Autonome de Douala',
  'Chambre de Commerce de Libreville',
]

const TITLES = [
  'Demande de subvention travaux',
  "Renouvellement d'agrément",
  'Contentieux fournisseur',
  'Dossier de conformité RGPD/CNIL',
  "Demande d'autorisation d'urbanisme",
  'Litige commercial',
  'Audit qualité annuel',
  'Dossier de financement',
  'Recours administratif',
  'Certification ISO 9001',
  "Demande d'exonération fiscale",
  'Renouvellement de bail commercial',
  'Procédure de mise en conformité douanière',
  "Dossier d'appel d'offres",
  'Régularisation de situation foncière',
  'Ouverture de succursale régionale',
]

const TAGS_POOL = ['urgent', 'confidentiel', 'multi-sites', 'récurrent', 'nouveau client', 'suivi juridique', 'à relancer', 'export UEMOA']

const BLOCK_REASONS = [
  'En attente de pièce complémentaire du client',
  'Bloqué en validation hiérarchique',
  "En attente de retour de l'administration",
  'Litige en cours de médiation',
  'En attente de paiement pour poursuivre',
  'En attente de scellé douanier',
]

const PHYSICAL_LOCATIONS = [
  'Archives centrales — Allée 3, Casier 12',
  'Archives centrales — Allée 7, Casier 4',
  'Bureau régional Abidjan — Salle 204',
  'Bureau régional Dakar — Salle 12',
  'Coffre sécurisé — Direction Juridique',
  'En transit vers Douala',
  'Numérisé uniquement — pas de copie papier',
  'Archives définitives — Allée 9',
  'Salle des scellés — Casier 2',
]

const STATUS_WEIGHTS: { status: DossierStatus; weight: number }[] = [
  { status: 'nouveau', weight: 3 },
  { status: 'en_cours', weight: 5 },
  { status: 'en_attente', weight: 3 },
  { status: 'bloque', weight: 2 },
  { status: 'termine', weight: 5 },
]

const PRIORITIES: Priority[] = ['basse', 'normale', 'haute', 'urgente']

export interface MemberSeedInput {
  name: string
  email: string
  phone: string
  role: Role
  status: MemberStatus
  color: string
  notificationChannel: NotificationChannel
}

export interface CompanySeedConfig {
  name: string
  slug: string
  plan: Plan
  seed: number
  dossierCount: number
  members: MemberSeedInput[]
}

// A single flagship tenant on the Enterprise plan — a pan-African professional services
// group headquartered in Abidjan with staff across the region.
export const COMPANY_SEEDS: CompanySeedConfig[] = [
  {
    name: 'Groupe Baobab Conseil',
    slug: 'groupe-baobab-conseil',
    plan: 'enterprise',
    seed: 20240930,
    dossierCount: 48,
    members: [
      { name: 'Aïssatou Koné', email: 'a.kone@baobab-conseil.africa', phone: '+225 07 11 22 33 44', role: 'admin', status: 'actif', color: 'violet', notificationChannel: 'whatsapp' },
      { name: 'Jean-Baptiste Owona', email: 'jb.owona@baobab-conseil.africa', phone: '+237 6 90 11 22 33', role: 'directeur', status: 'actif', color: 'blue', notificationChannel: 'whatsapp' },
      { name: 'Fatou Diagne', email: 'f.diagne@baobab-conseil.africa', phone: '+221 77 111 22 33', role: 'chef_service', status: 'actif', color: 'emerald', notificationChannel: 'whatsapp' },
      { name: 'Yao Kouadio', email: 'y.kouadio@baobab-conseil.africa', phone: '+225 05 55 66 77 88', role: 'collaborateur', status: 'actif', color: 'amber', notificationChannel: 'whatsapp' },
      { name: 'Grace Mbeki', email: 'g.mbeki@baobab-conseil.africa', phone: '+243 81 234 56 78', role: 'collaborateur', status: 'actif', color: 'rose', notificationChannel: 'sms' },
      { name: 'Salimata Traoré', email: 's.traore@baobab-conseil.africa', phone: '+223 76 12 34 56', role: 'collaborateur', status: 'actif', color: 'cyan', notificationChannel: 'whatsapp' },
      { name: 'Steeve Ndong', email: 's.ndong@baobab-conseil.africa', phone: '+241 06 12 34 56', role: 'collaborateur', status: 'actif', color: 'orange', notificationChannel: 'sms' },
      { name: 'Chantal Mukendi', email: 'c.mukendi@baobab-conseil.africa', phone: '+243 99 887 66 55', role: 'collaborateur', status: 'actif', color: 'blue', notificationChannel: 'whatsapp' },
      { name: 'Marième Ba', email: 'm.ba@baobab-conseil.africa', phone: '+221 78 222 33 44', role: 'collaborateur', status: 'en_attente', color: 'rose', notificationChannel: 'whatsapp' },
      { name: 'Paul-Henri Assogba', email: 'ph.assogba@baobab-conseil.africa', phone: '+229 97 12 34 56', role: 'secretariat', status: 'actif', color: 'emerald', notificationChannel: 'email' },
    ],
  },
]

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function buildSeedState(config: CompanySeedConfig, companyId: string): SuivixState {
  const rand = mulberry32(config.seed)
  let idCounter = 1
  const nextId = (prefix: string) => {
    idCounter += 1
    return `${prefix}-${companyId}-${idCounter.toString(36)}`
  }

  function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(rand() * arr.length)] as T
  }

  function pickSome<T>(arr: readonly T[], max: number): T[] {
    const count = Math.floor(rand() * (max + 1))
    const copy = [...arr]
    const out: T[] = []
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(rand() * copy.length)
      out.push(copy.splice(idx, 1)[0] as T)
    }
    return out
  }

  function pickStatus(): DossierStatus {
    const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0)
    let r = rand() * total
    for (const w of STATUS_WEIGHTS) {
      if (r < w.weight) return w.status
      r -= w.weight
    }
    return 'en_cours'
  }

  const members: Member[] = config.members.map((m) => ({ ...m, id: nextId('mem'), createdAt: isoDaysFromNow(-Math.floor(rand() * 500) - 60) }))
  const agents = members.filter((m) => m.role === 'collaborateur' || m.role === 'chef_service')
  const activeMembers = members.filter((m) => m.status === 'actif')

  const dossiers: Dossier[] = []
  const history: HistoryEntry[] = []
  const attachments: Attachment[] = []
  const tasks: SuivixState['tasks'] = []
  const notifications: AppNotification[] = []

  for (let i = 0; i < config.dossierCount; i++) {
    const status = pickStatus()
    const createdDaysAgo = Math.floor(rand() * 150) + 1
    const createdAt = isoDaysFromNow(-createdDaysAgo)
    const updatedDaysAgo =
      status === 'termine'
        ? Math.floor(rand() * createdDaysAgo)
        : Math.floor(rand() * Math.min(createdDaysAgo, 40))
    const updatedAt = isoDaysFromNow(-updatedDaysAgo)
    const assignedAgent = rand() > 0.06 ? pick(agents.length > 0 ? agents : activeMembers) : null
    const dueOffset = Math.floor(rand() * 60) - 20
    const dossierId = nextId('dos')
    const reference = `SVX-${new Date().getFullYear()}-${(i + 101).toString().padStart(4, '0')}`

    const dossier: Dossier = {
      id: dossierId,
      reference,
      title: pick(TITLES),
      client: pick(CLIENTS),
      description: 'Dossier généré pour la démonstration — contenu simulé.',
      status,
      priority: pick(PRIORITIES),
      agentId: assignedAgent ? assignedAgent.id : null,
      tags: pickSome(TAGS_POOL, 3),
      createdAt,
      updatedAt,
      dueDate: status === 'termine' ? null : isoDaysFromNow(dueOffset),
      blockReason: status === 'bloque' ? pick(BLOCK_REASONS) : null,
      physicalLocation: rand() > 0.15 ? pick(PHYSICAL_LOCATIONS) : null,
    }
    dossiers.push(dossier)

    history.push({
      id: nextId('hist'),
      dossierId,
      date: createdAt,
      type: 'creation',
      description: 'Dossier créé',
      authorId: pick(activeMembers).id,
    })
    if (assignedAgent) {
      history.push({
        id: nextId('hist'),
        dossierId,
        date: isoDaysFromNow(-createdDaysAgo + 1 > 0 ? -createdDaysAgo + 1 : -createdDaysAgo),
        type: 'assignment',
        description: `Dossier affecté à ${assignedAgent.name}`,
        authorId: pick(members.filter((m) => m.role !== 'collaborateur')).id,
      })
      if (rand() > 0.5) {
        notifications.push({
          id: nextId('notif'),
          memberId: assignedAgent.id,
          dossierId,
          channel: assignedAgent.notificationChannel,
          message: craftAssignmentMessage(reference, dossier.title),
          sentAt: updatedAt,
          read: rand() > 0.4,
        })
      }
    }
    if (status !== 'nouveau') {
      history.push({
        id: nextId('hist'),
        dossierId,
        date: updatedAt,
        type: 'status_change',
        description: `Statut changé en "${STATUS_LABELS[status]}"`,
        authorId: assignedAgent ? assignedAgent.id : pick(activeMembers).id,
      })
    }
    if (status === 'bloque' && dossier.blockReason) {
      history.push({
        id: nextId('hist'),
        dossierId,
        date: updatedAt,
        type: 'comment',
        description: `Motif de blocage : ${dossier.blockReason}`,
        authorId: assignedAgent ? assignedAgent.id : null,
      })
    }
    if (dossier.physicalLocation) {
      history.push({
        id: nextId('hist'),
        dossierId,
        date: createdAt,
        type: 'physical_move',
        description: `Dossier physique localisé : ${dossier.physicalLocation}`,
        authorId: pick(activeMembers).id,
      })
    }

    const attachmentCount = Math.floor(rand() * 4)
    for (let a = 0; a < attachmentCount; a++) {
      const isPdf = rand() > 0.4
      const attId = nextId('att')
      const uploadedAt = isoDaysFromNow(-Math.floor(rand() * createdDaysAgo))
      const attName = isPdf ? `piece-jointe-${a + 1}.pdf` : `document-${a + 1}.docx`
      attachments.push({
        id: attId,
        dossierId,
        name: attName,
        fileType: isPdf ? 'pdf' : 'word',
        size: Math.floor(rand() * 4_000_000) + 50_000,
        uploadedAt,
        uploadedBy: assignedAgent ? assignedAgent.id : pick(activeMembers).id,
      })
      history.push({
        id: nextId('hist'),
        dossierId,
        date: uploadedAt,
        type: 'attachment',
        description: `Pièce jointe ajoutée : ${attName}`,
        authorId: assignedAgent ? assignedAgent.id : null,
      })
    }

    const taskCount = Math.floor(rand() * 3)
    const taskTitles = ['Relancer le client', 'Vérifier les pièces', 'Envoyer le compte-rendu', 'Planifier rendez-vous', 'Valider la facturation']
    for (let t = 0; t < taskCount; t++) {
      tasks.push({
        id: nextId('task'),
        dossierId,
        title: pick(taskTitles),
        done: status === 'termine' ? true : rand() > 0.6,
        dueDate: isoDaysFromNow(Math.floor(rand() * 30) - 5),
        assigneeId: assignedAgent ? assignedAgent.id : null,
        createdAt,
      })
    }
  }

  const kpiDefinitions: KpiDefinition[] = [
    { id: nextId('kpi'), name: 'Volume traité (30j)', metric: 'volume_traite', period: '30j', weight: 30, createdAt: isoDaysFromNow(-60) },
    { id: nextId('kpi'), name: 'Taux de complétion (30j)', metric: 'taux_completion', period: '30j', weight: 40, createdAt: isoDaysFromNow(-60) },
    { id: nextId('kpi'), name: 'Délai moyen de traitement', metric: 'delai_moyen', period: '90j', weight: 30, createdAt: isoDaysFromNow(-60) },
  ]

  return { members, dossiers, history, attachments, tasks, kpiDefinitions, notifications }
}

export interface SeededCompany {
  company: Company
  state: SuivixState
}

export function buildAllSeedCompanies(): SeededCompany[] {
  return COMPANY_SEEDS.map((config, index) => {
    const companyId = `co-${index + 1}-${config.slug}`
    const company: Company = {
      id: companyId,
      name: config.name,
      slug: config.slug,
      plan: config.plan,
      createdAt: isoDaysFromNow(-(365 - index * 40)),
    }
    return { company, state: buildSeedState(config, companyId) }
  })
}
