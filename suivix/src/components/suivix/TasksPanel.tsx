import { useRef, useState } from 'react'
import { IconFile as FileIcon, IconFileText as FileText, IconListCheck as ListChecks, IconPaperclip as Paperclip, IconPlus as Plus, IconTrash as Trash2, IconX as X } from '@tabler/icons-react'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'
import { Checkbox } from '../../lib/shadcn/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../lib/shadcn/select'
import { toast } from '../../lib/shadcn/sonner'
import type { Attachment, Member, Task } from '../../lib/suivix/types'
import { formatDate, formatFileSize } from '../../lib/suivix/utils'
import type { PendingAttachment } from './DossierFormDialog'
import { EmptyState } from './PageHeader'

export function TasksPanel({
  tasks,
  attachments,
  members,
  canEdit,
  onAdd,
  onToggle,
  onDelete,
}: {
  tasks: Task[]
  attachments: Attachment[]
  members: Member[]
  canEdit: boolean
  onAdd: (title: string, dueDate: string | null, assigneeId: string | null, files: PendingAttachment[]) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState<string>('none')
  const [files, setFiles] = useState<PendingAttachment[]>([])
  const [showForm, setShowForm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function memberName(id: string | null) {
    if (!id) return null
    return members.find((m) => m.id === id)?.name ?? null
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const accepted: PendingAttachment[] = []
    for (const file of Array.from(list)) {
      const lower = file.name.toLowerCase()
      const isPdf = lower.endsWith('.pdf')
      const isWord = lower.endsWith('.doc') || lower.endsWith('.docx')
      if (!isPdf && !isWord) {
        toast.error(`Format non supporté : ${file.name} (Word/PDF uniquement)`)
        continue
      }
      accepted.push({ name: file.name, fileType: isPdf ? 'pdf' : 'word', size: file.size })
    }
    setFiles((f) => [...f, ...accepted])
  }

  function reset() {
    setTitle('')
    setDueDate('')
    setAssigneeId('none')
    setFiles([])
    setShowForm(false)
  }

  function submit() {
    if (!title.trim()) return
    onAdd(title.trim(), dueDate || null, assigneeId === 'none' ? null : assigneeId, files)
    reset()
  }

  const done = tasks.filter((t) => t.done).length

  return (
    <div className="space-y-density-md">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Tâches</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {done} sur {tasks.length} terminée{done > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {canEdit && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Ajouter une tâche
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-density-sm rounded-md border border-primary/30 bg-accent/30 p-density-md">
          <Input autoFocus placeholder="Intitulé de la tâche" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <div className="grid grid-cols-1 gap-density-sm sm:grid-cols-2">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Échéance de la tâche" />
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Assigné à" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assignée</SelectItem>
                {members
                  .filter((m) => m.status === 'actif')
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-xs">
                  {f.fileType === 'pdf' ? <FileText className="h-3.5 w-3.5 text-destructive" /> : <FileIcon className="h-3.5 w-3.5 text-primary" />}
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <button className="text-muted-foreground hover:text-destructive" aria-label={`Retirer ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-density-sm">
            <Button size="sm" variant="ghost" className="text-primary hover:text-primary" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-4 w-4" /> Joindre une pièce
            </Button>
            <div className="flex gap-density-sm">
              <Button size="sm" variant="ghost" onClick={reset}>
                Annuler
              </Button>
              <Button size="sm" onClick={submit} disabled={!title.trim()}>
                Ajouter la tâche
              </Button>
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        !showForm && <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Aucune tâche pour ce dossier" description="Découpez le traitement en étapes et assignez-les à l'équipe." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {tasks.map((t) => {
            const taskFiles = attachments.filter((a) => a.taskId === t.id)
            return (
              <li key={t.id} className="flex items-start gap-3 px-density-md py-density-sm">
                <Checkbox className="mt-0.5" checked={t.done} onCheckedChange={() => onToggle(t.id)} disabled={!canEdit} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${t.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.dueDate ? `Échéance ${formatDate(t.dueDate)}` : 'Sans échéance'}
                    {memberName(t.assigneeId) ? ` · ${memberName(t.assigneeId)}` : ''}
                  </p>
                  {taskFiles.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {taskFiles.map((a) => (
                        <li key={a.id} className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2 py-0.5 text-xs">
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          <span className="max-w-[200px] truncate">{a.name}</span>
                          <span className="font-mono text-[0.65rem] text-muted-foreground">{formatFileSize(a.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {canEdit && (
                  <Button size="icon" variant="ghost" aria-label="Supprimer la tâche" onClick={() => onDelete(t.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
