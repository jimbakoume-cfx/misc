import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRightLeft,
  BellRing,
  ChevronsUpDown,
  FolderKanban,
  FolderPlus,
  Gauge,
  LayoutDashboard,
  Menu,
  ScrollText,
  Search,
  Settings,
  UserCircle2,
  Users,
  X,
} from 'lucide-react'
import { useSuivix } from '../../lib/suivix/context'
import {
  canCreateDossier,
  canViewAuditLog,
  canViewDashboards,
  canViewKpi,
  canViewTeam,
  computeAlerts,
  initials,
  PLAN_LABELS,
  ROLE_CONFIG,
  visibleDossiersFor,
} from '../../lib/suivix/utils'
import { MemberAvatar } from './Badges'
import { SuivixLogo } from './Logo'
import { NotificationsBell } from './NotificationsBell'
import { ConnectivityWatcher } from './ConnectivityBadge'
import { PersonaSwitcherModal } from './PersonaSwitcherModal'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { PointerDialog } from './PointerDialog'
import { DossierFormDialog, parseTagsInput } from './DossierFormDialog'
import { Button } from '../../lib/shadcn/button'
import { toast } from '../../lib/shadcn/sonner'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  show: boolean
  count?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Quick actions any page can trigger (topbar, empty states, dossier pages).
interface ShellActions {
  openNewDossier: () => void
  openPointer: (dossierId?: string) => void
  openSearch: () => void
}

const ShellContext = createContext<ShellActions | null>(null)

export function useShell(): ShellActions {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within SuivixLayout')
  return ctx
}

export function SuivixLayout({ children }: { children: ReactNode }) {
  const { state, currentMember, setCurrentMemberId, currentCompany, markNotificationRead, markAllNotificationsRead, createDossier, addAttachment } =
    useSuivix()
  const location = useLocation()
  const navigate = useNavigate()
  const [personaOpen, setPersonaOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pointer, setPointer] = useState<{ open: boolean; dossierId?: string }>({ open: false })
  const [newOpen, setNewOpen] = useState(false)

  const canCreate = canCreateDossier(currentMember.role)
  const canPoint = true
  const visible = visibleDossiersFor(currentMember, state.dossiers)
  const activeCount = visible.filter((d) => d.status !== 'termine').length
  // Count dossiers needing attention, not individual alerts: one late, idle, blocked dossier is one item.
  const alertCount = new Set(computeAlerts(visible).filter((a) => a.severity === 'critical').map((a) => a.dossierId)).size

  useEffect(() => setDrawerOpen(false), [location.pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shell = useMemo<ShellActions>(
    () => ({
      openNewDossier: () => setNewOpen(true),
      openPointer: (dossierId?: string) => setPointer({ open: true, dossierId }),
      openSearch: () => setSearchOpen(true),
    }),
    []
  )

  const navGroups: NavGroup[] = [
    {
      label: 'Espace de travail',
      items: [
        { to: '/', label: 'Tableau de bord', icon: <LayoutDashboard className="h-4 w-4" />, show: true },
        { to: '/dossiers', label: 'Dossiers', icon: <FolderKanban className="h-4 w-4" />, show: true, count: activeCount },
        { to: '/alertes', label: 'Alertes', icon: <BellRing className="h-4 w-4" />, show: true, count: alertCount },
      ],
    },
    {
      label: 'Pilotage',
      items: [
        { to: '/agents', label: 'Vue par détenteur', icon: <Users className="h-4 w-4" />, show: canViewDashboards(currentMember.role) },
        { to: '/kpi', label: 'KPI & Scorecards', icon: <Gauge className="h-4 w-4" />, show: canViewKpi(currentMember.role) },
        { to: '/audit', label: "Journal d'audit", icon: <ScrollText className="h-4 w-4" />, show: canViewAuditLog(currentMember.role) },
      ],
    },
    {
      label: 'Administration',
      items: [
        { to: '/equipe', label: 'Équipe', icon: <UserCircle2 className="h-4 w-4" />, show: canViewTeam(currentMember.role) },
        { to: '/parametres', label: 'Paramètres', icon: <Settings className="h-4 w-4" />, show: true },
      ],
    },
  ]

  const commands: PaletteCommand[] = [
    ...(canCreate ? [{ id: 'cmd-new', label: 'Enregistrer un nouveau dossier', icon: <FolderPlus className="h-4 w-4" />, run: () => setNewOpen(true) }] : []),
    ...(canPoint ? [{ id: 'cmd-pointer', label: 'Pointer un transfert', icon: <ArrowRightLeft className="h-4 w-4" />, run: () => setPointer({ open: true }) }] : []),
    ...navGroups.flatMap((g) =>
      g.items.filter((i) => i.show).map((i) => ({ id: `nav-${i.to}`, label: i.label, hint: g.label, icon: i.icon, run: () => navigate(i.to) }))
    ),
  ]

  const sidebar = (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="flex items-start justify-between px-5 pb-6 pt-6">
        <SuivixLogo tagline tone="ink" />
        <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setDrawerOpen(false)} aria-label="Fermer le menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => {
          const items = group.items.filter((n) => n.show)
          if (items.length === 0) return null
          return (
            <div key={group.label} className="space-y-0.5">
              <p className="eyebrow px-2.5 pb-1.5 text-[0.6rem] text-white/35">{group.label}</p>
              {items.map((item) => {
                const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.85rem] font-medium transition-colors ${
                      active ? 'bg-primary text-white shadow-sm' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-white/50 group-hover:text-white/80'}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.count != null && item.count > 0 && (
                      <span className={`rounded px-1.5 font-mono text-[0.65rem] tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-white/[0.08] text-white/60'}`}>
                        {item.count}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => setPersonaOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          title="Changer de profil (démo)"
        >
          <MemberAvatar name={currentMember.name} color={currentMember.color} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8rem] font-medium">{currentMember.name}</span>
            <span className="block truncate text-[0.7rem] text-white/50">{ROLE_CONFIG[currentMember.role].label}</span>
            <span className="mt-0.5 block font-mono text-[0.6rem] uppercase tracking-wider text-primary/90">Démo · changer de profil</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/40" />
        </button>
      </div>
    </div>
  )

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
            <aside className="animate-rise absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-retool-lg">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
            <button className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <SuivixLogo size="sm" />
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 md:flex"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Rechercher un dossier, une page…</span>
              <kbd className="rounded border border-border bg-card px-1.5 font-mono text-[0.65rem]">⌘K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setSearchOpen(true)} aria-label="Rechercher">
                <Search className="h-[1.1rem] w-[1.1rem]" />
              </button>
              <NotificationsBell
                notifications={state.notifications.filter((n) => n.memberId === currentMember.id)}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllNotificationsRead}
              />
              {canPoint && (
                <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex" onClick={() => setPointer({ open: true })}>
                  <ArrowRightLeft className="h-4 w-4" /> Pointer
                </Button>
              )}
              {canCreate && (
                <Button size="sm" className="h-9" onClick={() => setNewOpen(true)} aria-label="Nouveau dossier">
                  <FolderPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nouveau dossier</span>
                </Button>
              )}
              <div className="ml-1 hidden items-center gap-2.5 border-l border-border pl-3 sm:flex" title={currentCompany.name}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink font-semibold text-[0.7rem] text-white">
                  {initials(currentCompany.name)}
                </div>
                <div className="hidden min-w-0 max-w-[180px] xl:block">
                  <p className="truncate text-sm font-semibold leading-tight">{currentCompany.name}</p>
                  <p className="eyebrow text-[0.6rem] text-primary">{PLAN_LABELS[currentCompany.plan]}</p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div key={location.pathname} className="animate-rise mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>

        <ConnectivityWatcher />
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} commands={commands} />
        <PointerDialog open={pointer.open} dossierId={pointer.dossierId} onOpenChange={(open) => setPointer((p) => ({ ...p, open }))} />
        <DossierFormDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          members={state.members}
          onSubmit={(values) => {
            const dossier = createDossier(
              {
                title: values.title,
                client: values.client,
                description: values.description,
                priority: values.priority,
                agentId: values.agentId,
                dueDate: values.dueDate,
                tags: parseTagsInput(values.tags),
              },
              currentMember.id
            )
            for (const a of values.attachments) addAttachment(dossier.id, a.name, a.fileType, a.size, currentMember.id)
            const pieces = values.attachments.length
            toast.success(`Dossier ${dossier.reference} enregistré${pieces ? ` avec ${pieces} pièce${pieces > 1 ? 's' : ''} jointe${pieces > 1 ? 's' : ''}` : ''}`, {
              action: { label: 'Ouvrir', onClick: () => navigate(`/dossiers/${dossier.id}`) },
            })
          }}
        />
        <PersonaSwitcherModal
          open={personaOpen}
          onOpenChange={setPersonaOpen}
          members={state.members}
          currentMemberId={currentMember.id}
          onSelect={setCurrentMemberId}
        />
      </div>
    </ShellContext.Provider>
  )
}
