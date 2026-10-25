// Alerts are sent by email to the member (simulated here) and listed in the notifications bell.

export function craftAssignmentMessage(reference: string, title: string): string {
  return `Suivix : le dossier ${reference} (${title}) vous a été affecté.`
}

export function craftBlockedMessage(reference: string, reason: string): string {
  return `Suivix : le dossier ${reference} est bloqué — ${reason}`
}

export function craftTaskMessage(reference: string, taskTitle: string): string {
  return `Suivix : nouvelle tâche sur ${reference} — "${taskTitle}"`
}

export function craftStatusMessage(reference: string, statusLabel: string): string {
  return `Suivix : le dossier ${reference} est passé au statut "${statusLabel}".`
}

export function craftReceiptMessage(company: string, reference: string, title: string, date: string): string {
  return `${company} — accusé de réception\nVotre dossier « ${title} » a été enregistré le ${date} sous la référence ${reference}.\nCitez cette référence pour tout suivi.`
}
