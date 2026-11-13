import { useRef } from 'react'
import { IconFileText as FileText, IconFile as FileIcon, IconListCheck as ListChecks, IconPaperclip as Paperclip, IconTrash as Trash2, IconUpload as Upload } from '@tabler/icons-react'
import { EmptyState } from './PageHeader'
import { Button } from '../../lib/shadcn/button'
import type { Attachment, Member, Task } from '../../lib/suivix/types'
import { formatDate, formatFileSize } from '../../lib/suivix/utils'
import { toast } from '../../lib/shadcn/sonner'

export function AttachmentsPanel({
  attachments,
  members,
  tasks = [],
  canEdit,
  onAdd,
  onRemove,
}: {
  attachments: Attachment[]
  members: Member[]
  tasks?: Task[]
  canEdit: boolean
  onAdd: (name: string, fileType: 'pdf' | 'word', size: number) => void
  onRemove: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase()
      const isPdf = lower.endsWith('.pdf')
      const isWord = lower.endsWith('.doc') || lower.endsWith('.docx')
      if (!isPdf && !isWord) {
        toast.error(`Format non supporté : ${file.name} (Word/PDF uniquement)`)
        continue
      }
      onAdd(file.name, isPdf ? 'pdf' : 'word', file.size)
      toast.success(`Pièce jointe ajoutée : ${file.name}`)
    }
  }

  function memberName(id: string | null) {
    if (!id) return 'Inconnu'
    return members.find((m) => m.id === id)?.name ?? 'Inconnu'
  }

  return (
    <div className="space-y-density-md">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Pièces jointes</h3>
          {attachments.length > 0 && <p className="text-xs text-muted-foreground">{attachments.length} document{attachments.length > 1 ? 's' : ''}</p>}
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Ajouter
            </Button>
          </>
        )}
      </div>
      {attachments.length === 0 ? (
        <EmptyState icon={<Paperclip className="h-5 w-5" />} title="Aucune pièce jointe" description="Ajoutez les documents Word ou PDF de ce dossier pour les retrouver en un clic." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-density-md py-density-sm">
              {a.fileType === 'pdf' ? (
                <FileText className="h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <FileIcon className="h-5 w-5 shrink-0 text-primary" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(a.size)} · ajouté le {formatDate(a.uploadedAt)} par {memberName(a.uploadedBy)}
                </p>
                {a.taskId && tasks.find((t) => t.id === a.taskId) && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary">
                    <ListChecks className="h-3 w-3" /> Tâche : {tasks.find((t) => t.id === a.taskId)!.title}
                  </p>
                )}
              </div>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Supprimer la pièce jointe"
                  onClick={() => onRemove(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
