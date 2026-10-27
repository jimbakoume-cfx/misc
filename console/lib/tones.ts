import type { Tone } from "@/components/ui/chip";

// Which colour each state wears across the console.
export const tripStatusTone: Record<string, Tone> = { searching: "warn", assigned: "neutral", arriving: "neutral", in_progress: "good", completed: "quiet", cancelled: "danger", no_car: "danger" };
export const paymentStateTone: Record<string, Tone> = { paid: "good", pending: "neutral", failed: "danger", refunded: "quiet", partially_refunded: "warn" };
export const allyStateTone: Record<string, Tone> = { on_trip: "good", available: "navy", on_break: "warn", off_shift: "quiet", suspended: "danger", left: "quiet" };
export const roadTone: Record<string, Tone> = { on_road: "good", off_road: "danger", in_preparation: "warn", left_fleet: "quiet" };
export const docStateTone: Record<string, Tone> = { valid: "good", expiring: "warn", expired: "danger", to_review: "neutral" };
export const identityTone: Record<string, Tone> = { verified: "good", pending: "warn", unverified: "quiet", rejected: "danger" };
export const disputeTone: Record<string, Tone> = { open: "danger", investigating: "warn", awaiting_rider: "neutral", resolved: "good", refunded: "good" };
export const severityTone: Record<string, Tone> = { high: "danger", medium: "warn", low: "neutral" };
export const orderTone: Record<string, Tone> = { draft: "quiet", pending_approval: "warn", approved: "neutral", paid: "good", rejected: "danger" };
export const invoiceTone: Record<string, Tone> = { issued: "neutral", paid: "good", overdue: "danger", void: "quiet" };
export const refundTone: Record<string, Tone> = { requested: "warn", approved: "neutral", settled: "good", refused: "danger" };
export const conversationTone: Record<string, Tone> = { waiting: "danger", open: "warn", closed: "quiet" };
export const operatorTone: Record<string, Tone> = { active: "good", invited: "warn", suspended: "danger" };
export const companyTone: Record<string, Tone> = { active: "good", suspended: "danger" };
export const riderStatusTone: Record<string, Tone> = { active: "good", deactivated: "quiet", blacklisted: "danger" };

export type Search = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
export function qs(base: Search, over: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    const s = one(v);
    if (s) p.set(k, s);
  }
  for (const [k, v] of Object.entries(over)) (v === undefined || v === "" ? p.delete(k) : p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
}
