import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody } from '../../lib/shadcn/dialog'
import { Badge } from '../../lib/shadcn/badge'
import type { Member } from '../../lib/suivix/types'
import { MemberAvatar } from './Badges'
import { ROLE_CONFIG, ROLE_ORDER } from '../../lib/suivix/utils'
import { Check } from 'lucide-react'


export function PersonaSwitcherModal({
  open,
  onOpenChange,
  members,
  currentMemberId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  currentMemberId: string
  onSelect: (id: string) => void
}) {
  const active = members.filter((m) => m.status === 'actif')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comptes de démonstration</DialogTitle>
          <DialogDescription>
            Suivix adapte l'interface et les droits selon le profil connecté. Choisissez un rôle pour explorer la plateforme sous cet angle —
            aucune donnée réelle n'est affectée.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-density-lg">
          {ROLE_ORDER.map((role) => {
            const roleMembers = active.filter((m) => m.role === role)
            if (roleMembers.length === 0) return null
            return (
              <div key={role} className="space-y-density-sm">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{ROLE_CONFIG[role].label}</h3>
                  <span className="text-xs text-muted-foreground">{ROLE_CONFIG[role].description}</span>
                </div>
                <div className="grid grid-cols-1 gap-density-sm sm:grid-cols-2">
                  {roleMembers.map((m) => {
                    const isCurrent = m.id === currentMemberId
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelect(m.id)
                          onOpenChange(false)
                        }}
                        className={`flex items-center gap-density-sm rounded-md border p-density-md text-left transition-colors hover:bg-accent ${
                          isCurrent ? 'border-primary bg-accent' : 'border-border'
                        }`}
                      >
                        <MemberAvatar name={m.name} color={m.color} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        {isCurrent && (
                          <Badge variant="default" className="gap-1">
                            <Check className="h-3 w-3" /> Actif
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
