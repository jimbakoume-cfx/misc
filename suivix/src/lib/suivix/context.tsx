import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocalStorageState, resetAllSuivixData } from './storage'
import { buildAllSeedCompanies } from './seed'
import { craftAssignmentMessage, craftBlockedMessage, craftTaskMessage } from './notifications'
import { companySettings, STATUS_CONFIG } from './utils'
import type {
  Attachment,
  AttachmentType,
  Company,
  Dossier,
  DossierStatus,
  Handover,
  HistoryEventType,
  KpiDefinition,
  Member,
  Priority,
  RequiredPiece,
  Role,
  SuivixRoot,
  SuivixState,
  Task,
} from './types'

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildSeedRoot(): SuivixRoot {
  const seeded = buildAllSeedCompanies()
  const dataByCompany: Record<string, SuivixState> = {}
  const currentMemberIdByCompany: Record<string, string> = {}
  for (const { company, state } of seeded) {
    dataByCompany[company.id] = state
    const admin = state.members.find((m) => m.role === 'admin')
    currentMemberIdByCompany[company.id] = admin ? admin.id : state.members[0]?.id ?? ''
  }
  return {
    companies: seeded.map((s) => s.company),
    currentCompanyId: seeded[0]?.company.id ?? '',
    dataByCompany,
    currentMemberIdByCompany,
  }
}

const EMPTY_STATE: SuivixState = { members: [], dossiers: [], history: [], attachments: [], tasks: [], kpiDefinitions: [], notifications: [], handovers: [] }

interface NewDossierInput {
  title: string
  client: string
  description: string
  priority: Priority
  agentId: string | null
  dueDate: string | null
  tags: string[]
  clientEmail?: string | null
  typeId?: string | null
  pieces?: RequiredPiece[]
}

export interface ImportRow {
  title: string
  client: string
  description: string
  agentId: string | null
  physicalLocation: string | null
  status: DossierStatus
}

interface NewCompanyInput {
  companyName: string
  adminName: string
  email: string
  phone: string
}

interface SuivixContextValue {
  companies: Company[]
  currentCompany: Company
  switchCompany: (id: string) => void
  createCompany: (input: NewCompanyInput) => void
  dataByCompany: Record<string, SuivixState>
  signedIn: boolean
  signIn: (companyId: string, memberId: string) => void
  signOut: () => void
  importDossiers: (rows: ImportRow[], authorId: string) => number
  updateCompany: (patch: Partial<Company>) => void
  updateMember: (id: string, patch: Partial<Member>) => void
  state: SuivixState
  currentMember: Member
  setCurrentMemberId: (id: string) => void
  createDossier: (input: NewDossierInput, authorId: string) => Dossier
  updateDossier: (id: string, patch: Partial<Dossier>, authorId: string) => void
  changeDossierStatus: (id: string, status: DossierStatus, authorId: string, blockReason?: string | null) => void
  assignDossier: (id: string, agentId: string | null, authorId: string) => void
  deleteDossier: (id: string) => void
  addAttachment: (dossierId: string, name: string, fileType: AttachmentType, size: number, authorId: string, taskId?: string | null) => void
  removeAttachment: (id: string, dossierId: string, authorId: string) => void
  addTask: (dossierId: string, title: string, dueDate: string | null, assigneeId: string | null, authorId: string) => Task
  toggleTask: (id: string, dossierId: string, authorId: string) => void
  deleteTask: (id: string) => void
  addComment: (dossierId: string, text: string, authorId: string) => void
  inviteMember: (name: string, email: string, role: Role) => Member
  updateMemberRole: (id: string, role: Role) => void
  removeMember: (id: string) => void
  activateMember: (id: string) => void
  addKpiDefinition: (def: Omit<KpiDefinition, 'id' | 'createdAt'>) => void
  removeKpiDefinition: (id: string) => void
  setPhysicalLocation: (dossierId: string, location: string, authorId: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  togglePiece: (dossierId: string, index: number, authorId: string) => void
  recordReminder: (dossierId: string, missing: string[], authorId: string) => void
  recordHandover: (input: Omit<Handover, 'id' | 'date'>) => Handover
  resetDemoData: () => void
}

const SuivixContext = createContext<SuivixContextValue | null>(null)

export function SuivixProvider({ children }: { children: ReactNode }) {
  // Bumped to v7: required pieces and handovers (décharges) — old cached sessions must not load into it.
  const [root, setRoot] = useLocalStorageState<SuivixRoot>('root_v7', buildSeedRoot)

  const currentCompanyId = root.currentCompanyId
  // Fill in lists that data saved by an older version may lack.
  const state: SuivixState = { ...EMPTY_STATE, ...root.dataByCompany[currentCompanyId] }

  // Updates only the current company's data slice, leaving every other tenant untouched.
  function updateCompanyState(updater: (prev: SuivixState) => SuivixState) {
    setRoot((prev) => ({
      ...prev,
      dataByCompany: {
        ...prev.dataByCompany,
        [prev.currentCompanyId]: updater(prev.dataByCompany[prev.currentCompanyId] ?? EMPTY_STATE),
      },
    }))
  }

  function pushHistory(dossierId: string, type: HistoryEventType, description: string, authorId: string | null) {
    updateCompanyState((prev) => ({
      ...prev,
      history: [...prev.history, { id: nowId('hist'), dossierId, date: nowIso(), type, description, authorId }],
    }))
  }

  function pushNotification(memberId: string, dossierId: string | null, message: string) {
    updateCompanyState((prev) => ({
      ...prev,
      notifications: [
        ...prev.notifications,
        { id: nowId('notif'), memberId, dossierId, message, sentAt: nowIso(), read: false },
      ],
    }))
  }

  const value = useMemo<SuivixContextValue>(() => {
    const currentCompany = root.companies.find((c) => c.id === currentCompanyId) ?? (root.companies[0] as Company)
    const currentMemberId = root.currentMemberIdByCompany[currentCompanyId]
    const currentMember = state.members.find((m) => m.id === currentMemberId) ?? (state.members[0] as Member)

    return {
      companies: root.companies,
      currentCompany,
      switchCompany: (id: string) => setRoot((prev) => ({ ...prev, currentCompanyId: id })),
      dataByCompany: root.dataByCompany,

      // A new workspace starts empty with its creator as administrator, on the free plan.
      createCompany: ({ companyName, adminName, email, phone }) => {
        const companyId = nowId('co')
        const admin: Member = {
          id: nowId('mem'),
          name: adminName,
          email,
          phone,
          role: 'admin',
          status: 'actif',
          color: 'blue',
          createdAt: nowIso(),
        }
        const company: Company = {
          id: companyId,
          name: companyName,
          slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          plan: 'starter',
          createdAt: nowIso(),
        }
        setRoot((prev) => ({
          ...prev,
          companies: [...prev.companies, company],
          currentCompanyId: companyId,
          dataByCompany: { ...prev.dataByCompany, [companyId]: { ...EMPTY_STATE, members: [admin] } },
          currentMemberIdByCompany: { ...prev.currentMemberIdByCompany, [companyId]: admin.id },
          signedIn: true,
        }))
      },

      signedIn: !!root.signedIn,
      signIn: (companyId, memberId) =>
        setRoot((prev) => ({
          ...prev,
          currentCompanyId: companyId,
          currentMemberIdByCompany: { ...prev.currentMemberIdByCompany, [companyId]: memberId },
          signedIn: true,
        })),
      signOut: () => setRoot((prev) => ({ ...prev, signedIn: false })),

      updateCompany: (patch) =>
        setRoot((prev) => ({ ...prev, companies: prev.companies.map((c) => (c.id === prev.currentCompanyId ? { ...c, ...patch } : c)) })),
      updateMember: (id, patch) =>
        updateCompanyState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

      // Bulk import of an existing register: references are numbered in one pass so they stay unique.
      importDossiers: (rows, authorId) => {
        const year = new Date().getFullYear()
        const base = state.dossiers.length
        const now = nowIso()
        const dossiers: Dossier[] = rows.map((r, i) => ({
          id: nowId('dos') + i,
          reference: `${companySettings(currentCompany).refPrefix}-${year}-${(base + i + 101).toString().padStart(4, '0')}`,
          title: r.title,
          client: r.client,
          description: r.description,
          status: r.status,
          priority: 'normale',
          agentId: r.agentId,
          tags: [],
          createdAt: now,
          updatedAt: now,
          dueDate: null,
          blockReason: null,
          physicalLocation: r.physicalLocation,
          clientEmail: null,
        }))
        const history = dossiers.map((d) => ({
          id: nowId('hist') + d.id,
          dossierId: d.id,
          date: now,
          type: 'creation' as const,
          description: 'Dossier importé depuis un registre existant',
          authorId,
        }))
        updateCompanyState((prev) => ({ ...prev, dossiers: [...prev.dossiers, ...dossiers], history: [...prev.history, ...history] }))
        return dossiers.length
      },

      state,
      currentMember,
      setCurrentMemberId: (id: string) =>
        setRoot((prev) => ({
          ...prev,
          currentMemberIdByCompany: { ...prev.currentMemberIdByCompany, [prev.currentCompanyId]: id },
        })),

      createDossier: (input, authorId) => {
        const id = nowId('dos')
        const count = state.dossiers.length + 1
        const dossier: Dossier = {
          id,
          reference: `${companySettings(currentCompany).refPrefix}-${new Date().getFullYear()}-${(count + 100).toString().padStart(4, '0')}`,
          title: input.title,
          client: input.client,
          description: input.description,
          status: 'nouveau',
          priority: input.priority,
          agentId: input.agentId,
          tags: input.tags,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          dueDate: input.dueDate,
          blockReason: null,
          physicalLocation: null,
          clientEmail: input.clientEmail ?? null,
          typeId: input.typeId ?? null,
          pieces: input.pieces ?? [],
        }
        updateCompanyState((prev) => ({ ...prev, dossiers: [...prev.dossiers, dossier] }))
        pushHistory(id, 'creation', 'Dossier créé', authorId)
        if (input.agentId) {
          const agent = state.members.find((m) => m.id === input.agentId)
          pushHistory(id, 'assignment', `Dossier affecté à ${agent ? agent.name : 'un agent'}`, authorId)
          if (agent) pushNotification(agent.id, id, craftAssignmentMessage(dossier.reference, dossier.title))
        }
        return dossier
      },

      updateDossier: (id, patch, authorId) => {
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: nowIso() } : d)),
        }))
        pushHistory(id, 'update', 'Informations du dossier modifiées', authorId)
      },

      changeDossierStatus: (id, status, authorId, blockReason) => {
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.map((d) =>
            d.id === id
              ? { ...d, status, updatedAt: nowIso(), blockReason: status === 'bloque' ? blockReason ?? d.blockReason : null }
              : d
          ),
        }))
        const label =
          status === 'bloque' && blockReason
            ? `Statut changé en "Bloqué" — ${blockReason}`
            : `Statut changé en "${STATUS_CONFIG[status].label}"`
        pushHistory(id, 'status_change', label, authorId)
        if (status === 'bloque') {
          const dossier = state.dossiers.find((d) => d.id === id)
          const agent = dossier?.agentId ? state.members.find((m) => m.id === dossier.agentId) : null
          if (dossier && agent) {
            pushNotification(agent.id, id, craftBlockedMessage(dossier.reference, blockReason ?? dossier.blockReason ?? 'motif non renseigné'))
          }
        }
      },

      assignDossier: (id, agentId, authorId) => {
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.map((d) => (d.id === id ? { ...d, agentId, updatedAt: nowIso() } : d)),
        }))
        const agent = state.members.find((m) => m.id === agentId)
        pushHistory(id, 'assignment', agent ? `Dossier affecté à ${agent.name}` : 'Dossier désaffecté', authorId)
        if (agent) {
          const dossier = state.dossiers.find((d) => d.id === id)
          if (dossier) pushNotification(agent.id, id, craftAssignmentMessage(dossier.reference, dossier.title))
        }
      },

      deleteDossier: (id) => {
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.filter((d) => d.id !== id),
          history: prev.history.filter((h) => h.dossierId !== id),
          attachments: prev.attachments.filter((a) => a.dossierId !== id),
          tasks: prev.tasks.filter((t) => t.dossierId !== id),
          handovers: prev.handovers.filter((h) => h.dossierId !== id),
        }))
      },

      addAttachment: (dossierId, name, fileType, size, authorId, taskId = null) => {
        const att: Attachment = { id: nowId('att'), dossierId, name, fileType, size, uploadedAt: nowIso(), uploadedBy: authorId, taskId }
        updateCompanyState((prev) => ({ ...prev, attachments: [...prev.attachments, att] }))
        pushHistory(dossierId, 'attachment', `Pièce jointe ajoutée : ${name}`, authorId)
      },

      removeAttachment: (id, dossierId, authorId) => {
        const att = state.attachments.find((a) => a.id === id)
        updateCompanyState((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.id !== id) }))
        if (att) pushHistory(dossierId, 'attachment', `Pièce jointe supprimée : ${att.name}`, authorId)
      },

      addTask: (dossierId, title, dueDate, assigneeId, authorId) => {
        const task: Task = { id: nowId('task'), dossierId, title, done: false, dueDate, assigneeId, createdAt: nowIso() }
        updateCompanyState((prev) => ({ ...prev, tasks: [...prev.tasks, task] }))
        pushHistory(dossierId, 'task', `Tâche créée : ${title}`, authorId)
        if (assigneeId) {
          const assignee = state.members.find((m) => m.id === assigneeId)
          const dossier = state.dossiers.find((d) => d.id === dossierId)
          if (assignee && dossier) pushNotification(assignee.id, dossierId, craftTaskMessage(dossier.reference, title))
        }
        return task
      },

      toggleTask: (id, dossierId, authorId) => {
        let title = ''
        let willBeDone = false
        updateCompanyState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => {
            if (t.id !== id) return t
            title = t.title
            willBeDone = !t.done
            return { ...t, done: !t.done }
          }),
        }))
        pushHistory(dossierId, 'task', `Tâche ${willBeDone ? 'terminée' : 'réouverte'} : ${title}`, authorId)
      },

      deleteTask: (id) => {
        updateCompanyState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== id) }))
      },

      addComment: (dossierId, text, authorId) => {
        pushHistory(dossierId, 'comment', text, authorId)
        updateCompanyState((prev) => ({ ...prev, dossiers: prev.dossiers.map((d) => (d.id === dossierId ? { ...d, updatedAt: nowIso() } : d)) }))
      },

      inviteMember: (name, email, role) => {
        const member: Member = {
          id: nowId('mem'),
          name,
          email,
          phone: '—',
          role,
          status: 'en_attente',
          color: ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'orange'][Math.floor(Math.random() * 7)] as string,
          createdAt: nowIso(),
        }
        updateCompanyState((prev) => ({ ...prev, members: [...prev.members, member] }))
        return member
      },

      updateMemberRole: (id, role) => {
        updateCompanyState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, role } : m)) }))
      },

      removeMember: (id) => {
        updateCompanyState((prev) => ({
          ...prev,
          members: prev.members.filter((m) => m.id !== id),
          dossiers: prev.dossiers.map((d) => (d.agentId === id ? { ...d, agentId: null } : d)),
        }))
      },

      activateMember: (id) => {
        updateCompanyState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, status: 'actif' } : m)) }))
      },

      addKpiDefinition: (def) => {
        updateCompanyState((prev) => ({
          ...prev,
          kpiDefinitions: [...prev.kpiDefinitions, { ...def, id: nowId('kpi'), createdAt: nowIso() }],
        }))
      },

      removeKpiDefinition: (id) => {
        updateCompanyState((prev) => ({ ...prev, kpiDefinitions: prev.kpiDefinitions.filter((k) => k.id !== id) }))
      },

      setPhysicalLocation: (dossierId, location, authorId) => {
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.map((d) => (d.id === dossierId ? { ...d, physicalLocation: location, updatedAt: nowIso() } : d)),
        }))
        pushHistory(dossierId, 'physical_move', `Dossier physique localisé : ${location}`, authorId)
      },

      markNotificationRead: (id) => {
        updateCompanyState((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }))
      },

      markAllNotificationsRead: () => {
        updateCompanyState((prev) => ({ ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }))
      },

      togglePiece: (dossierId, index, authorId) => {
        const piece = state.dossiers.find((d) => d.id === dossierId)?.pieces?.[index]
        if (!piece) return
        updateCompanyState((prev) => ({
          ...prev,
          dossiers: prev.dossiers.map((d) =>
            d.id === dossierId ? { ...d, updatedAt: nowIso(), pieces: (d.pieces ?? []).map((p, i) => (i === index ? { ...p, received: !p.received } : p)) } : d
          ),
        }))
        pushHistory(dossierId, 'update', piece.received ? `Pièce marquée manquante : ${piece.name}` : `Pièce reçue : ${piece.name}`, authorId)
      },

      recordReminder: (dossierId, missing, authorId) => {
        pushHistory(dossierId, 'update', `Relance envoyée au client — ${missing.length} pièce${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''}`, authorId)
      },

      recordHandover: (input) => {
        const handover: Handover = { ...input, id: nowId('ho'), date: nowIso() }
        updateCompanyState((prev) => ({ ...prev, handovers: [...prev.handovers, handover] }))
        return handover
      },

      resetDemoData: () => {
        resetAllSuivixData()
        window.location.reload()
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, state, currentCompanyId])

  return <SuivixContext.Provider value={value}>{children}</SuivixContext.Provider>
}

export function useSuivix(): SuivixContextValue {
  const ctx = useContext(SuivixContext)
  if (!ctx) throw new Error('useSuivix must be used within a SuivixProvider')
  return ctx
}
