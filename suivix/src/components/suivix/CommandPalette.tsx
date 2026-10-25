import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowRight as ArrowRight, IconCornerDownLeft as CornerDownLeft, IconFileText as FileText, IconSearch as Search } from '@tabler/icons-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useSuivix } from '../../lib/suivix/context'
import type { DossierStatus } from '../../lib/suivix/types'
import { visibleDossiersFor } from '../../lib/suivix/utils'
import { StatusBadge } from './Badges'

export interface PaletteCommand {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
}

// ⌘K / Ctrl+K palette: jump to any page, run a quick action or open a dossier by reference.
export function CommandPalette({ open, onOpenChange, commands }: { open: boolean; onOpenChange: (open: boolean) => void; commands: PaletteCommand[] }) {
  const { state, currentMember } = useSuivix()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cmds = commands.filter((c) => !q || c.label.toLowerCase().includes(q))
    const dossiers = visibleDossiersFor(currentMember, state.dossiers)
      .filter((d) => q && `${d.reference} ${d.title} ${d.client}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map<PaletteCommand & { status?: DossierStatus }>((d) => ({
        id: d.id,
        label: d.title,
        hint: `${d.reference} · ${d.client}`,
        icon: <FileText className="h-4 w-4" />,
        status: d.status,
        run: () => navigate(`/dossiers/${d.id}`),
      }))
    return [...dossiers, ...cmds] as (PaletteCommand & { status?: DossierStatus })[]
  }, [query, commands, state.dossiers, currentMember, navigate])

  useEffect(() => setActive(0), [query])

  function runAt(i: number) {
    const item = items[i]
    if (!item) return
    onOpenChange(false)
    item.run()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-retool-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(items.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runAt(active)
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Recherche rapide</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Rechercher un dossier ou aller à une page</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un dossier (SVX-…), une page, une action…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground sm:block">ESC</kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
            {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun résultat pour « {query} ».</p>}
            {items.map((item, i) => (
              <button
                key={item.id}
                onMouseMove={() => setActive(i)}
                onClick={() => runAt(i)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${i === active ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}
              >
                <span className={i === active ? 'text-primary' : 'text-muted-foreground'}>{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.hint && <span className="block truncate font-mono text-[0.7rem] uppercase text-muted-foreground">{item.hint}</span>}
                </span>
                {item.status && <StatusBadge status={item.status} />}
                {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" /> : <ArrowRight className="h-3.5 w-3.5 text-transparent" />}
              </button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
