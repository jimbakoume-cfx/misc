import type { Attachment, Dossier, HistoryEntry, Member, Task } from './types'
import { formatDate, formatDateTime, formatFileSize, STATUS_CONFIG, PRIORITY_CONFIG } from './utils'

// Export is simulated on the client — there is no real document-generation
// backend. "Word" export downloads an HTML file with a .doc extension (Word
// opens HTML content natively). "PDF" export opens a print-ready window and
// triggers the browser print dialog, where the user can choose "Save as PDF".

function memberName(members: Member[], id: string | null): string {
  if (!id) return 'Non affecté'
  return members.find((m) => m.id === id)?.name ?? 'Inconnu'
}

function buildReportHtml(
  dossier: Dossier,
  history: HistoryEntry[],
  attachments: Attachment[],
  tasks: Task[],
  members: Member[]
): string {
  const historyRows = history
    .filter((h) => h.dossierId === dossier.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(
      (h) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${formatDateTime(h.date)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(h.description)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(memberName(members, h.authorId))}</td></tr>`
    )
    .join('')

  const attachmentRows = attachments
    .filter((a) => a.dossierId === dossier.id)
    .map(
      (a) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(a.name)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${a.fileType.toUpperCase()}</td><td style="padding:4px 8px;border:1px solid #ddd;">${formatFileSize(a.size)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${formatDate(a.uploadedAt)}</td></tr>`
    )
    .join('')

  const taskRows = tasks
    .filter((t) => t.dossierId === dossier.id)
    .map(
      (t) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(t.title)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${t.done ? 'Terminée' : 'En cours'}</td><td style="padding:4px 8px;border:1px solid #ddd;">${formatDate(t.dueDate)}</td></tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(dossier.reference)}</title></head>
<body style="font-family: 'Sora', Calibri, Arial, sans-serif; color:#101828; padding: 0; margin: 0;">
  <div style="background:#1E5AE8;height:6px;"></div>
  <div style="padding: 24px 32px;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:24px;">
    <span style="font-size:20px;color:#101828;"><span style="font-weight:600;">suivi</span><span style="font-weight:300;color:#1E5AE8;">x</span><span style="display:inline-block;width:5px;height:5px;margin-left:2px;background:#1E5AE8;"></span></span>
    <span style="font-family:'IBM Plex Mono',SFMono-Regular,Consolas,monospace;font-size:11px;color:#4A5568;">${escapeHtml(dossier.reference)}</span>
  </div>
  <h1 style="margin-bottom:0;font-weight:600;">${escapeHtml(dossier.title)}</h1>
  <p style="color:#4A5568;margin-top:4px;font-family:'IBM Plex Mono',SFMono-Regular,Consolas,monospace;font-size:12px;">Export généré le ${formatDateTime(new Date().toISOString())}</p>
  <table style="border-collapse:collapse;margin:16px 0;width:100%;">
    <tr><td style="padding:4px 8px;font-weight:bold;">Client</td><td style="padding:4px 8px;">${escapeHtml(dossier.client)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">Statut</td><td style="padding:4px 8px;">${STATUS_CONFIG[dossier.status].label}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">Priorité</td><td style="padding:4px 8px;">${PRIORITY_CONFIG[dossier.priority].label}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">Agent en charge</td><td style="padding:4px 8px;">${escapeHtml(memberName(members, dossier.agentId))}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">Créé le</td><td style="padding:4px 8px;">${formatDate(dossier.createdAt)}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;">Échéance</td><td style="padding:4px 8px;">${formatDate(dossier.dueDate)}</td></tr>
    ${dossier.blockReason ? `<tr><td style="padding:4px 8px;font-weight:bold;">Motif de blocage</td><td style="padding:4px 8px;">${escapeHtml(dossier.blockReason)}</td></tr>` : ''}
  </table>
  <p>${escapeHtml(dossier.description)}</p>

  <h2 style="color:#101828;border-bottom:2px solid #B9CCF9;padding-bottom:4px;">Tâches</h2>
  <table style="border-collapse:collapse;width:100%;">
    <tr><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Tâche</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Statut</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Échéance</th></tr>
    ${taskRows || '<tr><td style="padding:4px 8px;" colspan="3">Aucune tâche</td></tr>'}
  </table>

  <h2 style="color:#101828;border-bottom:2px solid #B9CCF9;padding-bottom:4px;">Pièces jointes</h2>
  <table style="border-collapse:collapse;width:100%;">
    <tr><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Nom</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Type</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Taille</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Ajouté le</th></tr>
    ${attachmentRows || '<tr><td style="padding:4px 8px;" colspan="4">Aucune pièce jointe</td></tr>'}
  </table>

  <h2 style="color:#101828;border-bottom:2px solid #B9CCF9;padding-bottom:4px;">Historique</h2>
  <table style="border-collapse:collapse;width:100%;">
    <tr><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Date</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Évènement</th><th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Auteur</th></tr>
    ${historyRows || '<tr><td style="padding:4px 8px;" colspan="3">Aucun historique</td></tr>'}
  </table>

  <p style="color:#4A5568;font-size:11px;margin-top:32px;font-style:italic;">suivix — Réception et suivi de dossier. Document généré automatiquement (export simulé — démonstration frontend).</p>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function exportDossierAsWord(
  dossier: Dossier,
  history: HistoryEntry[],
  attachments: Attachment[],
  tasks: Task[],
  members: Member[]
) {
  const html = buildReportHtml(dossier, history, attachments, tasks, members)
  const blob = new Blob([html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${dossier.reference}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportDossierAsPdf(
  dossier: Dossier,
  history: HistoryEntry[],
  attachments: Attachment[],
  tasks: Task[],
  members: Member[]
) {
  const html = buildReportHtml(dossier, history, attachments, tasks, members)
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) return
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}
