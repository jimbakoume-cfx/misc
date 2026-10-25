import type {
  AppNotification,
  Attachment,
  Handover,
  Company,
  Dossier,
  DossierStatus,
  HistoryEntry,
  KpiDefinition,
  Member,
  MemberStatus,
  Plan,
  Priority,
  Role,
  SuivixState,
} from './types'
import { craftAssignmentMessage } from './notifications'
import { DEFAULT_DOSSIER_TYPES } from './utils'

// Seed titles that belong to one of the starter dossier types (and so carry required pieces).
const TITLE_TYPES: Record<string, string> = {
  "Renouvellement d'agrément": 'agrement',
  "Demande d'autorisation d'urbanisme": 'agrement',
  "Dossier d'appel d'offres": 'appel-offres',
  "Demande d'exonération fiscale": 'fiscal',
  'Contentieux fournisseur': 'contentieux',
  'Litige commercial': 'contentieux',
}

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
  'Préfecture du Mfoundi',
  'Groupe Aurex Industries',
  'Mairie de Douala 1er',
  'Hôpital Général de Yaoundé',
  'Banque Meridia Cameroun',
  'SCI Les Baobabs',
  'Fondation Horizon Adamaoua',
  'Assurances Vertes Cameroun',
  'Étude Notariale Me Ngono',
  'Port Autonome de Douala',
  'Chambre de Commerce de Douala',
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

const TAGS_POOL = ['urgent', 'confidentiel', 'multi-sites', 'récurrent', 'nouveau client', 'suivi juridique', 'à relancer', 'export CEMAC']

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
  'Agence de Douala — Salle 204',
  'Agence de Garoua — Salle 12',
  'Coffre sécurisé — Direction Juridique',
  'En transit vers Douala',
  'Numérisé uniquement — pas de copie papier',
  'Archives définitives — Allée 9',
  'Salle des scellés — Casier 2',
]

const STATUS_WEIGHTS: { status: DossierStatus; weight: number }[] = [
  { status: 'nouveau', weight: 3 },
  { status: 'en_cours', weight: 7 },
  { status: 'en_attente', weight: 2 },
  { status: 'bloque', weight: 1 },
  { status: 'termine', weight: 6 },
]

const PRIORITIES: Priority[] = ['basse', 'normale', 'haute', 'urgente']

export interface MemberSeedInput {
  name: string
  email: string
  phone: string
  role: Role
  status: MemberStatus
  color: string
  jobTitle?: string
}

export interface CompanySeedConfig {
  name: string
  slug: string
  plan: Plan
  seed: number
  dossierCount: number
  members: MemberSeedInput[]
  extra?: Pick<Company, 'profile' | 'settings'>
}

// A single flagship tenant on the Enterprise plan — a professional services firm
// headquartered in Yaoundé with an office in Douala.
export const COMPANY_SEEDS: CompanySeedConfig[] = [
  {
    name: 'Groupe Baobab Conseil',
    slug: 'groupe-baobab-conseil',
    plan: 'enterprise',
    seed: 20240930,
    dossierCount: 48,
    extra: {
      profile: {
        legalName: 'Groupe Baobab Conseil SA',
        sector: 'Conseil juridique, fiscal et administratif',
        niu: 'M052400012345K',
        rccm: 'RC/YAO/2019/B/1234',
        address: 'Rue 1.750, Bastos',
        city: 'Yaoundé',
        phone: '+237 222 20 14 50',
        email: 'contact@baobab-conseil.cm',
        website: 'baobab-conseil.cm',
      },
      settings: { refPrefix: 'SVX', inactivityDays: 7, dueSoonDays: 3 },
    },
    members: [
      { name: 'Aïssatou Koné', email: 'a.kone@baobab-conseil.cm', phone: '+237 677 11 22 33', jobTitle: 'Directrice administrative', role: 'admin', status: 'actif', color: 'violet' },
      { name: 'Jean-Baptiste Owona', email: 'jb.owona@baobab-conseil.cm', phone: '+237 690 11 22 33', jobTitle: 'Directeur général', role: 'directeur', status: 'actif', color: 'blue' },
      { name: 'Fatou Diagne', email: 'f.diagne@baobab-conseil.cm', phone: '+237 699 21 43 65', jobTitle: 'Cheffe du service juridique', role: 'chef_service', status: 'actif', color: 'emerald' },
      { name: 'Yao Kouadio', email: 'y.kouadio@baobab-conseil.cm', phone: '+237 655 55 66 77', jobTitle: 'Juriste', role: 'collaborateur', status: 'actif', color: 'amber' },
      { name: 'Grace Mbeki', email: 'g.mbeki@baobab-conseil.cm', phone: '+237 681 23 45 67', jobTitle: 'Fiscaliste', role: 'collaborateur', status: 'actif', color: 'rose' },
      { name: 'Salimata Traoré', email: 's.traore@baobab-conseil.cm', phone: '+237 670 12 34 56', jobTitle: 'Juriste', role: 'collaborateur', status: 'actif', color: 'cyan' },
      { name: 'Steeve Ndong', email: 's.ndong@baobab-conseil.cm', phone: '+237 694 12 34 56', jobTitle: 'Assistant juridique', role: 'collaborateur', status: 'actif', color: 'orange' },
      { name: 'Chantal Mukendi', email: 'c.mukendi@baobab-conseil.cm', phone: '+237 699 88 76 65', jobTitle: 'Comptable', role: 'collaborateur', status: 'actif', color: 'blue' },
      { name: 'Marième Ba', email: 'm.ba@baobab-conseil.cm', phone: '+237 678 22 33 44', jobTitle: 'Juriste stagiaire', role: 'collaborateur', status: 'en_attente', color: 'rose' },
      { name: 'Paul-Henri Assogba', email: 'ph.assogba@baobab-conseil.cm', phone: '+237 697 12 34 56', jobTitle: 'Responsable courrier', role: 'secretariat', status: 'actif', color: 'emerald' },
    ],
  },
]

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
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
  const agents = members.filter((m) => m.status === 'actif' && (m.role === 'collaborateur' || m.role === 'chef_service'))
  const activeMembers = members.filter((m) => m.status === 'actif')

  const dossiers: Dossier[] = []
  const history: HistoryEntry[] = []
  const attachments: Attachment[] = []
  const tasks: SuivixState['tasks'] = []
  const notifications: AppNotification[] = []
  const handovers: Handover[] = []
  const registrar = members.find((m) => m.role === 'secretariat' && m.status === 'actif') ?? null

  for (let i = 0; i < config.dossierCount; i++) {
    const status = pickStatus()
    const createdDaysAgo = Math.floor(rand() * 150) + 1
    const createdAt = isoDaysFromNow(-createdDaysAgo)
    const updatedDaysAgo =
      status === 'termine'
        ? Math.floor(rand() * createdDaysAgo)
        : (status === 'bloque' || status === 'en_attente') && rand() > 0.5
          ? Math.min(createdDaysAgo, 8 + Math.floor(rand() * 10))
          : Math.floor(rand() * Math.min(createdDaysAgo, 5))
    // Spread movements over working hours instead of stamping them all "now".
    const updatedAt = isoDaysFromNow(-updatedDaysAgo - 0.05 - rand() * 0.3)
    const assignedAgent = rand() > 0.06 ? pick(agents.length > 0 ? agents : activeMembers) : null
    const dueOffset = rand() > 0.12 ? Math.floor(rand() * 40) + 4 : -Math.floor(rand() * 6) - 1
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
    const type = DEFAULT_DOSSIER_TYPES.find((t) => t.id === TITLE_TYPES[dossier.title])
    if (type) {
      dossier.typeId = type.id
      dossier.pieces = type.pieces.map((name) => ({ name, received: status === 'termine' || rand() > (status === 'en_attente' || status === 'nouveau' ? 0.55 : 0.1) }))
      // A dossier waiting on the client is always missing at least one piece.
      if (status === 'en_attente' && dossier.pieces.every((p) => p.received)) dossier.pieces[dossier.pieces.length - 1]!.received = false
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
      handovers.push({
        id: nextId('ho'),
        dossierId,
        fromId: registrar?.id ?? null,
        toId: assignedAgent.id,
        date: isoDaysFromNow(-createdDaysAgo + 1 > 0 ? -createdDaysAgo + 1 : -createdDaysAgo),
        location: dossier.physicalLocation,
        note: null,
        signature: null,
        recordedBy: registrar?.id ?? assignedAgent.id,
      })
      if (rand() > 0.5) {
        notifications.push({
          id: nextId('notif'),
          memberId: assignedAgent.id,
          dossierId,
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

  return { members, dossiers, history, attachments, tasks, kpiDefinitions, notifications, handovers }
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
    return { company: { ...company, ...config.extra }, state: buildSeedState(config, companyId) }
  })
}
