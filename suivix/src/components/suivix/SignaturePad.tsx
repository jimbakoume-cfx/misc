import { useEffect, useRef, useState } from 'react'
import { IconEraser as Eraser } from '@tabler/icons-react'
import { Button } from '../../lib/shadcn/button'

// Finger or mouse signature, returned as a PNG data URL (null while empty).
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const drawn = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#101828'
  }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    drawn.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label="Zone de signature"
          className="h-28 w-full touch-none rounded-md border border-dashed border-input bg-white"
          onPointerDown={(e) => {
            drawing.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            const ctx = e.currentTarget.getContext('2d')!
            const { x, y } = point(e)
            ctx.beginPath()
            ctx.moveTo(x, y)
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            const ctx = e.currentTarget.getContext('2d')!
            const { x, y } = point(e)
            ctx.lineTo(x, y)
            ctx.stroke()
            drawn.current = true
            setEmpty(false)
          }}
          onPointerUp={(e) => {
            if (!drawing.current) return
            drawing.current = false
            if (drawn.current) onChange(e.currentTarget.toDataURL('image/png'))
          }}
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Signez ici avec le doigt ou la souris</span>}
      </div>
      {!empty && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear}>
          <Eraser className="h-3.5 w-3.5" /> Effacer
        </Button>
      )}
    </div>
  )
}
