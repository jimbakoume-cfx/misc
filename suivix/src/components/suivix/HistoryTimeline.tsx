import { useState } from 'react'
import { IconFileText as FileText, IconMessage as MessageSquare, IconCirclePlus as PlusCircle, IconRefresh as RefreshCw, IconUserPlus as UserPlus, IconClipboardList as ClipboardList, IconPencil as Pencil, IconMapPin as MapPin } from '@tabler/icons-react'
import { Button } from '../../lib/shadcn/button'
import { Textarea } from '../../lib/shadcn/textarea'
import type { HistoryEntry, HistoryEventType, Member } from '../../lib/suivix/types'
import { formatDateTime } from '../../lib/suivix/utils'

const ICONS: Record<HistoryEventType, typeof FileText> = {
  creation: PlusCircle,
  status_change: RefreshCw,
  assignment: UserPlus,
  attachment: FileText,
  task: ClipboardList,
  comment: MessageSquare,
  update: Pencil,
  physical_move: MapPin,
}

export function HistoryTimeline({
  history,
  members,
  canComment,
  onAddComment,
}: {
  history: HistoryEntry[]
  members: Member[]
  canComment: boolean
  onAddComment: (text: string) => void
}) {
  const [comment, setComment] = useState('')
  const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  function memberName(id: string | null) {
    if (!id) return 'Système'
    return members.find((m) => m.id === id)?.name ?? 'Ancien membre'
  }

  return (
    <div className="space-y-density-md">
      <h3 className="text-sm font-semibold">Historique</h3>

      {canComment && (
        <div className="space-y-density-sm">
          <Textarea placeholder="Ajouter un commentaire…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!comment.trim()}
              onClick={() => {
                onAddComment(comment.trim())
                setComment('')
              }}
            >
              Commenter
            </Button>
          </div>
        </div>
      )}

      <ol className="space-y-density-md border-l border-border pl-density-lg">
        {sorted.map((h) => {
          const Icon = ICONS[h.type]
          return (
            <li key={h.id} className="relative">
              <span className="absolute -left-[1.65rem] flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm">{h.description}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(h.date)} · {memberName(h.authorId)}
              </p>
            </li>
          )
        })}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground">Aucun évènement.</p>}
      </ol>
    </div>
  )
}
