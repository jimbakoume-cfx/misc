import type { NotificationChannel } from './types'

// "Moat" feature #1 — multi-channel alerting. In Francophone Africa, WhatsApp and SMS
// reach people far more reliably than email, so every automated alert is simulated as
// being delivered through the member's preferred channel instead of only in-app/email.

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
}

export function deliveryLine(channel: NotificationChannel, phone: string, email: string): string {
  if (channel === 'whatsapp') return `Envoyé via WhatsApp au ${phone}`
  if (channel === 'sms') return `Envoyé par SMS au ${phone}`
  return `Envoyé par email à ${email}`
}

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
