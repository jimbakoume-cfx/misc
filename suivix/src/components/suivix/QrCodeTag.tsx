import { QRCodeSVG } from 'qrcode.react'

// "Moat" feature #2 — paper/digital bridge. Many administrations and firms in the region
// still rely on physical folders; this printable tag links a physical dossier back to its
// digital twin in Suivix so it can be scanned and located instantly.
export function QrCodeTag({ reference, size = 120 }: { reference: string; size?: number }) {
  return (
    <div className="inline-flex flex-col items-center gap-density-sm rounded-md border border-border bg-white p-density-md">
      <QRCodeSVG value={`suivix://dossier/${reference}`} size={size} bgColor="#ffffff" fgColor="#101828" level="M" />
      <span className="font-mono text-[10px] text-slate-600">{reference}</span>
    </div>
  )
}
