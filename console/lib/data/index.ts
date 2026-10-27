// The only module pages read data from. Today it serves the sample data in ./mock;
// point these functions at the real API (Supabase RPCs, REST) and no page needs to change.
import * as db from "./mock";
import type { Ally, Page, Rider, Trip, Vehicle } from "./types";

export type * from "./types";

const PAGE_SIZE = 25;

function paginate<T>(rows: T[], page = 1, pageSize = PAGE_SIZE): Page<T> {
  const p = Math.max(1, page);
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), total: rows.length, page: p, pageSize };
}
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const matches = (q: string | undefined, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => f && norm(f).includes(norm(q.trim())));

export const allyName = (a: Pick<Ally, "firstName" | "lastName">) => `${a.firstName} ${a.lastName}`;
export const riderName = (r: Pick<Rider, "firstName" | "lastName">) => `${r.firstName} ${r.lastName}`;

export async function getCities() { return db.cities; }
export async function getTiers() { return db.tiers; }
export async function getZones() { return db.zones; }
export function cityName(id: string) { return db.cities.find((c) => c.id === id)?.name ?? id; }
export function lookupAlly(id: string | null) { return id ? db.allies.find((a) => a.id === id) ?? null : null; }
export function lookupRider(id: string | null) { return id ? db.riders.find((r) => r.id === id) ?? null : null; }
export function lookupVehicle(id: string | null) { return id ? db.vehicles.find((v) => v.id === id) ?? null : null; }
export function lookupCompany(id: string | null) { return id ? db.companies.find((c) => c.id === id) ?? null : null; }
export function lookupTrip(id: string | null) { return id ? db.trips.find((t) => t.id === id) ?? null : null; }

export type TripFilters = { q?: string; status?: string; type?: string; tier?: string; fare?: string; from?: string; to?: string; page?: number };
export async function listTrips(f: TripFilters = {}): Promise<Page<Trip>> {
  const rows = db.trips.filter((t) => {
    const ally = lookupAlly(t.allyId);
    const rider = lookupRider(t.riderId);
    if (!matches(f.q, t.ref, t.pickup, t.dropoff, ally && allyName(ally), rider && riderName(rider), rider?.phone)) return false;
    if (f.status === "live" ? !["searching", "assigned", "arriving", "in_progress"].includes(t.status) : f.status && t.status !== f.status) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.tier && t.tier !== f.tier) return false;
    if (f.fare === "lt5k" && t.fare >= 5000) return false;
    if (f.fare === "5k-15k" && (t.fare < 5000 || t.fare > 15000)) return false;
    if (f.fare === "gt15k" && t.fare <= 15000) return false;
    if (f.from && t.requestedAt < f.from) return false;
    if (f.to && t.requestedAt > f.to + "T23:59:59") return false;
    return true;
  });
  return paginate(rows, f.page);
}
export async function getTrip(id: string) { return lookupTrip(id); }

export type AllyFilters = { q?: string; city?: string; tier?: string; rating?: string; activity?: string; trips?: string; page?: number };
export async function listAllies(f: AllyFilters = {}): Promise<Page<Ally>> {
  const rows = db.allies.filter((a) => {
    if (!matches(f.q, allyName(a), a.badge, a.phone)) return false;
    if (f.city && a.cityId !== f.city) return false;
    if (f.tier && a.tier !== f.tier) return false;
    if (f.rating === "lt4.5" && a.rating >= 4.5) return false;
    if (f.rating === "gte4.8" && a.rating < 4.8) return false;
    if (f.activity && a.state !== f.activity) return false;
    if (f.trips === "none" && a.tripsThisMonth > 0) return false;
    if (f.trips === "gt100" && a.tripsThisMonth <= 100) return false;
    return true;
  });
  return paginate(rows, f.page);
}
export async function getAlly(id: string) { return lookupAlly(id); }

export type RiderFilters = { q?: string; city?: string; loyalty?: string; identity?: string; status?: string; page?: number };
export async function listRiders(f: RiderFilters = {}): Promise<Page<Rider>> {
  const rows = db.riders.filter((r) => {
    if (!matches(f.q, riderName(r), r.phone, r.email)) return false;
    if (f.city && r.cityId !== f.city) return false;
    if (f.loyalty && r.loyalty !== f.loyalty) return false;
    if (f.identity && r.identity !== f.identity) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
  return paginate(rows, f.page);
}
export async function getRider(id: string) { return lookupRider(id); }

export async function listCompanies(q?: string) { return db.companies.filter((c) => matches(q, c.name, c.accountId)); }
export async function getCompany(id: string) { return lookupCompany(id); }

export type VehicleFilters = { q?: string; city?: string; tier?: string; road?: string; papers?: string };
export async function listVehicles(f: VehicleFilters = {}): Promise<Vehicle[]> {
  return db.vehicles.filter((v) => {
    if (!matches(f.q, v.plate, v.make, v.model, v.vin)) return false;
    if (f.city && v.cityId !== f.city) return false;
    if (f.tier && v.tier !== f.tier) return false;
    if (f.road && v.road !== f.road) return false;
    if (f.papers === "attention" && !v.papers.some((p) => Date.parse(p.expiresAt) - Date.now() < 30 * 86400000)) return false;
    return true;
  });
}
export async function getVehicle(id: string) { return lookupVehicle(id); }

export async function listDocuments(state?: string, whose?: string) {
  return db.documents
    .filter((d) => (!state ? d.state !== "valid" : state === "all" || d.state === state))
    .filter((d) => !whose || d.whose.kind === whose)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function listDisputes(stage?: string) {
  return db.disputes.filter((d) => (!stage ? true : stage === "active" ? !["resolved", "refunded"].includes(d.stage) : d.stage === stage));
}
export async function getDispute(id: string) { return db.disputes.find((d) => d.id === id) ?? null; }

export async function listAlerts(status?: string) {
  return db.alerts.filter((a) => (!status ? a.status !== "closed" : status === "all" || a.status === status));
}
export async function listConversations(status?: string) {
  return db.conversations.filter((c) => !status || c.status === status);
}
export async function getConversation(id: string) { return db.conversations.find((c) => c.id === id) ?? null; }

export async function listOrders() { return db.orders; }
export async function listInvoices(companyId?: string) { return db.invoices.filter((i) => !companyId || i.companyId === companyId); }
export async function listRefunds() { return db.refunds; }

export async function getRota() {
  return {
    pairs: db.vehicles.filter((v) => v.road !== "left_fleet"),
    endOfShift: db.endOfShift,
    unfiled: db.shiftReports,
  };
}
export async function listPromos() { return db.promos; }
export async function listBroadcasts() { return db.broadcasts; }
export async function listOperators() { return db.operators; }
export async function listAudit(q?: string) { return db.audit.filter((e) => matches(q, e.actor, e.action, e.target, e.detail)); }

export async function getOverview() {
  const live = db.trips.filter((t) => ["searching", "assigned", "arriving", "in_progress"].includes(t.status));
  const today = db.trips.filter((t) => Date.now() - Date.parse(t.requestedAt) < 24 * 3600_000);
  const done = today.filter((t) => t.status === "completed");
  return {
    tripsToday: today.length,
    completedToday: done.length,
    cancelledToday: today.filter((t) => t.status === "cancelled").length,
    revenueToday: done.reduce((s, t) => s + t.charged, 0),
    averageWaitMin: done.length ? Math.round((done.reduce((s, t) => s + t.waitMin, 0) / done.length) * 10) / 10 : 0,
    alliesOnTrip: db.allies.filter((a) => a.state === "on_trip").length,
    alliesAvailable: db.allies.filter((a) => a.state === "available").length,
    alliesOnBreak: db.allies.filter((a) => a.state === "on_break").length,
    vehiclesOffRoad: db.vehicles.filter((v) => v.road === "off_road" || v.road === "in_preparation").length,
    live,
    waiting: live.filter((t) => t.status === "searching"),
    hourly: db.hourlyTrips,
    dailyRevenue: db.dailyRevenue,
    openAlerts: db.alerts.filter((a) => a.status !== "closed"),
    activeDisputes: db.disputes.filter((d) => !["resolved", "refunded"].includes(d.stage)).length,
    waitingConversations: db.conversations.filter((c) => c.status === "waiting").length,
    documentsDue: db.documents.filter((d) => d.state === "expiring" || d.state === "expired").length,
    unfiled: db.shiftReports.length,
    ordersToApprove: db.orders.filter((o) => o.status === "pending_approval").length,
    refundsRequested: db.refunds.filter((r) => r.status === "requested").length,
    byCity: db.cities.map((c) => ({
      city: c,
      live: live.filter((t) => t.cityId === c.id).length,
      available: db.allies.filter((a) => a.cityId === c.id && a.state === "available").length,
    })),
  };
}

export async function getMapPoints(cityId: string) {
  return db.allies
    .filter((a) => a.cityId === cityId && ["on_trip", "available", "on_break"].includes(a.state))
    .map((a) => ({ id: a.id, name: allyName(a), badge: a.badge, state: a.state, lat: a.lat, lng: a.lng, plate: lookupVehicle(a.vehicleId)?.plate ?? "", sos: db.alerts.some((x) => x.kind === "sos" && x.status === "open" && x.subjectHref?.endsWith(a.id)) }));
}
