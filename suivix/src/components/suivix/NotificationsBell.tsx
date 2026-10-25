import { IconBell as Bell, IconMail as Mail } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../lib/shadcn/dropdown-menu'
import { Button } from '../../lib/shadcn/button'
import type { AppNotification } from '../../lib/suivix/types'
import { formatDateTime } from '../../lib/suivix/utils'

export function NotificationsBell({
  notifications,
  onMarkAllRead,
  onMarkRead,
}: {
  notifications: AppNotification[]
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
}) {
  const sorted = [...notifications].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()).slice(0, 20)
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-density-sm py-density-xs">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onMarkAllRead}>
              Tout marquer lu
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {sorted.length === 0 && <p className="px-density-sm py-density-md text-center text-sm text-muted-foreground">Aucune notification.</p>}
        <div className="max-h-96 overflow-y-auto">
          {sorted.map((n) => {
            const content = (
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read ? 'text-muted-foreground' : 'font-medium'}`}>{n.message}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Envoyé par email · {formatDateTime(n.sentAt)}
                  </p>
                </div>
                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </div>
            )
            return (
              <DropdownMenuItem key={n.id} onSelect={() => onMarkRead(n.id)} asChild={false} className="items-start whitespace-normal py-density-sm">
                {n.dossierId ? (
                  <Link to={`/dossiers/${n.dossierId}`} className="w-full">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </DropdownMenuItem>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
