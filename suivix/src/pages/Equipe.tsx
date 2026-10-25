import { useState } from 'react'
import { Plus, Trash2, UserCheck } from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import { Card, CardContent } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../lib/shadcn/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../lib/shadcn/alert-dialog'
import { useSuivix } from '../lib/suivix/context'
import { canManageTeam, canViewTeam, formatDate, ROLE_CONFIG, ROLE_ORDER } from '../lib/suivix/utils'
import type { Role } from '../lib/suivix/types'
import { MemberAvatar, RoleBadge } from '../components/suivix/Badges'
import { toast } from '../lib/shadcn/sonner'
import { PageHeader } from '../components/suivix/PageHeader'

export default function Equipe() {
  const { state, currentMember, inviteMember, updateMemberRole, removeMember, activateMember } = useSuivix()
  const isAdmin = canManageTeam(currentMember.role)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('collaborateur')

  if (!canViewTeam(currentMember.role)) {
    return <p className="text-muted-foreground">Cette page est réservée aux administrateurs, directeurs et chefs de service.</p>
  }

  function submitInvite() {
    if (!name.trim() || !email.trim()) return
    inviteMember(name.trim(), email.trim(), role)
    toast.success(`Invitation envoyée à ${name.trim()} (simulée)`)
    setName('')
    setEmail('')
    setRole('collaborateur')
    setOpen(false)
  }

  return (
    <div className="space-y-density-lg">
      <div className="flex flex-col gap-density-md sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="Administration" title="Équipe" subtitle={<>{state.members.length} membre{state.members.length === 1 ? '' : 's'}</>} />
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Inviter un membre
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="rounded-md border border-border bg-muted/50 px-density-md py-density-sm text-sm text-muted-foreground">
          Lecture seule — seul un Admin peut gérer l'équipe et les rôles.
        </p>
      )}

      <Card>
        <CardContent className="p-density-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Membre depuis</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MemberAvatar name={m.name} color={m.color} size="sm" />
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && m.id !== currentMember.id ? (
                      <Select value={m.role} onValueChange={(v) => updateMemberRole(m.id, v as Role)}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_ORDER.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_CONFIG[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === 'actif' ? 'success' : 'warning'}>{m.status === 'actif' ? 'Actif' : 'En attente'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-density-xs">
                        {m.status === 'en_attente' && (
                          <Button size="sm" variant="outline" onClick={() => activateMember(m.id)}>
                            <UserCheck className="h-4 w-4" /> Activer
                          </Button>
                        )}
                        {m.id !== currentMember.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="Retirer le membre" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Retirer {m.name} ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ses dossiers affectés deviendront non affectés. Cette action est réversible en le réinvitant.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeMember(m.id)}>Retirer</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-density-md">
            <p className="text-xs text-muted-foreground">
              Simulation : aucun email n'est réellement envoyé. Le membre est ajouté avec le statut "en attente".
            </p>
            <div className="space-y-density-xs">
              <Label htmlFor="invite-name">Nom</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
            </div>
            <div className="space-y-density-xs">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@entreprise.com" />
            </div>
            <div className="space-y-density-xs">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ORDER.map((r) => (
                    <SelectItem key={r} value={r}>
                      <span className="flex flex-col">
                        <span>{ROLE_CONFIG[r].label}</span>
                        <span className="text-xs text-muted-foreground">{ROLE_CONFIG[r].description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button disabled={!name.trim() || !email.trim()} onClick={submitInvite}>
              Envoyer l'invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
