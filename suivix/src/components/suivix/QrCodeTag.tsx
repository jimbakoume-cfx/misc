import { QRCodeSVG } from 'qrcode.react'

// Paper/digital bridge: many firms in the region still rely on physical folders; this printable
// tag links a physical dossier to its record in Suivix so it can be scanned and pointed instantly.
// The label encodes a web link, so any phone camera opens the quick "pointer" screen for the dossier.
export function dossierScanUrl(reference: string): string {
  return `${window.location.origin}/p/${encodeURIComponent(reference)}`
}

export function QrCodeTag({ reference, size = 120 }: { reference: string; size?: number }) {
  return (
    <div className="inline-flex flex-col items-center gap-density-sm rounded-md border border-border bg-white p-density-md">
      <QRCodeSVG value={dossierScanUrl(reference)} size={size} bgColor="#ffffff" fgColor="#101828" level="M" />
      <span className="font-mono text-[10px] text-slate-600">{reference}</span>
    </div>
  )
}
