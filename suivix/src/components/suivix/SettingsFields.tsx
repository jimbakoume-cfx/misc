import { useRef, type ReactNode } from 'react'
import { Button } from '../../lib/shadcn/button'
import { Label } from '../../lib/shadcn/label'
import { toast } from '../../lib/shadcn/sonner'

// Shared building blocks for the Paramètres sections.

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-density-md">
      {dirty && <span className="mr-auto text-xs text-muted-foreground">Modifications non enregistrées</span>}
      <Button variant="ghost" disabled={!dirty} onClick={onReset}>
        Annuler
      </Button>
      <Button disabled={!dirty} onClick={onSave}>
        Enregistrer
      </Button>
    </div>
  )
}

// Reads an image and downsizes it so it fits comfortably in browser storage.
export function readImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export function ImagePicker({ onPick, children }: { onPick: (dataUrl: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (f.size > 5_000_000) {
            toast.error('Image trop lourde (5 Mo maximum).')
            return
          }
          try {
            onPick(await readImage(f))
          } catch {
            toast.error('Impossible de lire cette image.')
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  )
}
