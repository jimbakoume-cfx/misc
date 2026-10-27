// Deterministic sample data so every page renders without a backend.
// Swap lib/data/index.ts to read from your API; pages only depend on the functions exported there.
import type {
  Ally, Alert, AuditEvent, Broadcast, City, Company, ComplianceDoc, Conversation, Dispute, EndOfShift,
  FinanceOrder, Invoice, Operator, Promo, Refund, Rider, ShiftReport, Tier, TierCode, Trip, Vehicle, Zone,
} from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261027);
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const round = (n: number, step = 50) => Math.round(n / step) * step;

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

export const cities: City[] = [
  { id: "dla", name: "Douala", timezone: "Africa/Douala", isDefault: true, lat: 4.0511, lng: 9.7679, active: true },
  { id: "yde", name: "Yaoundé", timezone: "Africa/Douala", isDefault: false, lat: 3.848, lng: 11.5021, active: true },
  { id: "kbi", name: "Kribi", timezone: "Africa/Douala", isDefault: false, lat: 2.9406, lng: 9.9101, active: true },
];

const PLACES: Record<string, string[]> = {
  dla: ["Akwa", "Bonanjo", "Bonapriso", "Deïdo", "Bali", "Makepe", "Bonamoussadi", "Kotto", "Logpom", "Ndokoti", "Bépanda", "Japoma", "Yassa", "Aéroport de Douala", "Gare de Bessengué", "Ndogbong"],
  yde: ["Bastos", "Mvan", "Essos", "Nlongkak", "Biyem-Assi", "Omnisport", "Mokolo", "Centre-ville", "Aéroport de Nsimalen", "Mvog-Mbi", "Etoa-Meki", "Ngousso"],
  kbi: ["Centre", "Mpangou", "Ngoyè", "Londji", "Port de Kribi", "Grand Batanga"],
};

export const tiers: Tier[] = [
  { id: "t1", code: "pro", name: "Pro", order: 1, seats: 4, fleet: 0, baseFare: 1000, perKm: 250, perMinute: 40, minimumFare: 1500, switches: { rides: true, rentals: true, airport: true, companies: true }, active: true },
  { id: "t2", code: "plus", name: "Plus", order: 2, seats: 4, fleet: 0, baseFare: 1500, perKm: 350, perMinute: 55, minimumFare: 2500, switches: { rides: true, rentals: true, airport: true, companies: true }, active: true },
  { id: "t3", code: "vip", name: "VIP", order: 3, seats: 4, fleet: 0, baseFare: 3000, perKm: 600, perMinute: 90, minimumFare: 6000, switches: { rides: true, rentals: true, airport: true, companies: false }, active: true },
];

const MEN = ["Jean", "Paul", "Serge", "Hervé", "Armand", "Blaise", "Christian", "Didier", "Emmanuel", "Franck", "Gaston", "Ibrahim", "Junior", "Landry", "Martial", "Patrick", "Roland", "Samuel", "Thierry", "Yannick", "Boris", "Cédric", "Alain", "Rodrigue"];
const WOMEN = ["Aïcha", "Brigitte", "Carine", "Danielle", "Estelle", "Flore", "Grace", "Hortense", "Inès", "Joëlle", "Laure", "Mireille", "Nadège", "Odile", "Prisca", "Sandrine", "Viviane", "Rachel", "Mariam", "Christelle"];
const LAST = ["Mbarga", "Ngono", "Essomba", "Tchoupo", "Kamga", "Fotso", "Nkodo", "Abena", "Owona", "Ndjock", "Mballa", "Ekane", "Njoya", "Talla", "Tchinda", "Ngassa", "Biyong", "Manga", "Atangana", "Ewane", "Kouam", "Nana", "Simo", "Djeumo", "Moukoko", "Epée"];
const phone = () => `+237 6${int(50, 99)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)}`;
const cityPick = () => (rnd() < 0.62 ? "dla" : rnd() < 0.8 ? "yde" : "kbi");

const MODELS: Record<TierCode, [string, string][]> = {
  pro: [["Toyota", "Corolla"], ["Hyundai", "Elantra"], ["Kia", "Cerato"], ["Toyota", "Yaris"]],
  plus: [["Toyota", "Camry"], ["Kia", "K5"], ["Toyota", "RAV4"], ["Hyundai", "Tucson"]],
  vip: [["Mercedes-Benz", "Classe E"], ["Toyota", "Land Cruiser Prado"], ["Lexus", "ES"]],
};
const COLOURS = ["Noir", "Blanc", "Gris", "Argent", "Bleu nuit"];
const REGION: Record<string, string> = { dla: "LT", yde: "CE", kbi: "SU" };

export const vehicles: Vehicle[] = Array.from({ length: 64 }, (_, i) => {
  const tier: TierCode = i < 36 ? "pro" : i < 56 ? "plus" : "vip";
  const [make, model] = pick(MODELS[tier]);
  const cityId = cityPick();
  const road = i % 17 === 5 ? "off_road" : i % 23 === 7 ? "in_preparation" : i === 63 ? "left_fleet" : "on_road";
  const exp = (d: number) => ahead(d * DAY);
  return {
    id: `v${pad(i + 1, 3)}`,
    plate: `${REGION[cityId]} ${int(100, 999)} ${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}`,
    make, model,
    year: int(2018, 2025),
    colour: pick(COLOURS),
    vin: `JT${int(100, 999)}${String.fromCharCode(65 + int(0, 25))}${int(1000000000, 9999999999)}`.slice(0, 17),
    tier, cityId, road,
    odometer: int(12000, 186000),
    papers: [
      { kind: "insurance", number: `ASS-${int(100000, 999999)}`, expiresAt: exp(int(-6, 320)) },
      { kind: "vignette", number: `VIG-${int(10000, 99999)}`, expiresAt: exp(int(-3, 200)) },
      { kind: "inspection", number: `VT-${int(10000, 99999)}`, expiresAt: exp(int(4, 170)) },
      { kind: "registration", number: `CG-${int(100000, 999999)}`, expiresAt: exp(int(400, 2000)) },
    ],
    allyIds: [],
    restDays: [int(0, 6)],
    lastServiceAt: ago(int(3, 80) * DAY),
  };
});

const ALLY_STATES = ["on_trip", "on_trip", "available", "available", "available", "on_break", "off_shift", "off_shift"] as const;
export const allies: Ally[] = Array.from({ length: 118 }, (_, i) => {
  const v = vehicles[i % 62];
  const state = i === 41 || i === 97 ? "suspended" : i === 110 ? "left" : pick(ALLY_STATES);
  const city = cities.find((c) => c.id === v.cityId)!;
  const ally: Ally = {
    id: `a${pad(i + 1, 3)}`,
    badge: `CF-${pad(140 + i * 3, 4)}`,
    firstName: pick(MEN),
    lastName: pick(LAST),
    phone: phone(),
    cityId: v.cityId,
    tier: v.tier,
    rating: Math.round((4.2 + rnd() * 0.8) * 100) / 100,
    state,
    role: i < 62 ? "titulaire" : "relief",
    trips: int(40, 3400),
    tripsThisMonth: int(0, 180),
    joinedAt: ago(int(20, 900) * DAY),
    lastActiveAt: ago(state === "off_shift" ? int(5, 40) * HOUR : int(0, 12) * MIN),
    vehicleId: i < 118 ? v.id : null,
    earningsThisMonth: round(int(40000, 620000), 500),
    acceptance: Math.round((0.72 + rnd() * 0.27) * 100) / 100,
    fatigueOpen: i === 17,
    lat: city.lat + (rnd() - 0.5) * 0.09,
    lng: city.lng + (rnd() - 0.5) * 0.09,
  };
  if (ally.state !== "left") v.allyIds.push(ally.id);
  return ally;
});
for (const t of tiers) t.fleet = vehicles.filter((v) => v.tier === t.code && v.road !== "left_fleet").length;

const COMPANY_NAMES = ["Orange Cameroun", "SABC Boissons", "Total Énergies Marketing", "Port Autonome de Douala", "Afriland First Bank", "Hôtel Akwa Palace", "Ecobank Cameroun", "Dangote Cement", "CAMTEL", "Société Générale Cameroun", "Hilton Yaoundé", "Nestlé Cameroun"];
export const companies: Company[] = COMPANY_NAMES.map((name, i) => {
  const billingMode = i % 3 === 1 ? "prepaid" : "credit";
  return {
    id: `c${pad(i + 1, 2)}`,
    name,
    accountId: `ENT-${pad(1001 + i * 7, 5)}`,
    cityId: i % 4 === 3 ? "yde" : "dla",
    billingMode,
    creditLimit: billingMode === "credit" ? round(int(2, 20) * 500000, 100000) : 0,
    prepaidBalance: billingMode === "prepaid" ? round(int(50000, 3000000), 5000) : 0,
    owed: billingMode === "credit" ? round(int(0, 4000000), 5000) : 0,
    riders: int(6, 180),
    tripsThisMonth: int(10, 640),
    spendThisMonth: round(int(150000, 9000000), 5000),
    status: i === 7 ? "suspended" : "active",
    billingEmail: `facturation@${name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 12)}.cm`,
    since: ago(int(60, 700) * DAY),
  };
});

const LOYALTY = ["none", "none", "none", "silver", "silver", "gold", "platinum"] as const;
const IDENTITY = ["verified", "verified", "verified", "verified", "pending", "unverified", "rejected"] as const;
export const riders: Rider[] = Array.from({ length: 240 }, (_, i) => {
  const woman = chance(0.5);
  const firstName = woman ? pick(WOMEN) : pick(MEN);
  const lastName = pick(LAST);
  const trips = int(0, 220);
  return {
    id: `r${pad(i + 1, 4)}`,
    firstName, lastName,
    phone: phone(),
    email: chance(0.7) ? `${firstName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@mail.cm` : null,
    memberSince: ago(int(2, 800) * DAY),
    loyalty: trips > 150 ? "platinum" : trips > 90 ? "gold" : pick(LOYALTY),
    cityId: cityPick(),
    identity: pick(IDENTITY),
    trips,
    wallet: chance(0.06) ? -round(int(500, 8000)) : round(int(0, 85000), 100),
    lastTripAt: trips ? ago(int(0, 40 * 24) * HOUR) : null,
    companyId: chance(0.18) ? pick(companies).id : null,
    status: i === 13 ? "blacklisted" : i % 61 === 9 ? "deactivated" : "active",
  };
});

const TRIP_TYPES = ["ride", "ride", "ride", "ride", "ride", "airport", "rental", "company"] as const;
const PAYMENTS = ["cash", "cash", "mobile_money", "mobile_money", "wallet", "card"] as const;
let tripSeq = 48210;
function makeTrip(minutesAgo: number, forceStatus?: Trip["status"]): Trip {
  const rider = pick(riders);
  const type = rider.companyId && chance(0.5) ? "company" : pick(TRIP_TYPES);
  const cityId = rider.cityId;
  const places = PLACES[cityId];
  const tierCode: TierCode = chance(0.6) ? "pro" : chance(0.75) ? "plus" : "vip";
  const t = tiers.find((x) => x.code === tierCode)!;
  const distanceKm = type === "rental" ? int(20, 120) : type === "airport" ? int(12, 32) : Math.round((1.5 + rnd() * 16) * 10) / 10;
  const durationMin = type === "rental" ? pick([120, 240, 480]) : Math.round(distanceKm * (2.2 + rnd() * 2.5));
  const fare = Math.max(t.minimumFare, round(t.baseFare + distanceKm * t.perKm + durationMin * t.perMinute, 100));
  const status: Trip["status"] =
    forceStatus ?? (minutesAgo < 50 ? pick(["searching", "assigned", "arriving", "in_progress", "in_progress"] as const) : chance(0.1) ? "cancelled" : chance(0.02) ? "no_car" : "completed");
  const live = status !== "completed" && status !== "cancelled" && status !== "no_car";
  const ally = status === "searching" || status === "no_car" ? null : pick(allies.filter((a) => a.cityId === cityId && a.tier === tierCode) as Ally[]) ?? null;
  const payment = type === "company" ? "company" : pick(PAYMENTS);
  const paymentState: Trip["paymentState"] =
    status === "cancelled" || status === "no_car" ? "refunded" : live ? "pending" : chance(0.04) ? "failed" : chance(0.03) ? "partially_refunded" : "paid";
  let pickup = pick(places);
  let dropoff = pick(places.filter((p) => p !== pickup));
  if (type === "airport") (chance(0.5) ? (pickup = places.find((p) => p.startsWith("Aéroport")) ?? pickup) : (dropoff = places.find((p) => p.startsWith("Aéroport")) ?? dropoff));
  return {
    id: `trip_${tripSeq}`,
    ref: `C-${tripSeq--}`,
    requestedAt: ago(minutesAgo * MIN),
    status, type, tier: tierCode,
    allyId: ally?.id ?? null,
    riderId: rider.id,
    companyId: type === "company" ? rider.companyId ?? pick(companies).id : null,
    cityId, pickup, dropoff, distanceKm, durationMin, fare,
    charged: status === "cancelled" ? (chance(0.3) ? 1000 : 0) : status === "completed" ? fare : 0,
    payment, paymentState,
    waitMin: int(2, 14),
    rating: status === "completed" && chance(0.7) ? pick([5, 5, 5, 4, 4, 3, 2]) : null,
    cancelReason: status === "cancelled" ? pick(["rider_changed_mind", "driver_late", "wrong_address", "no_show"]) : null,
  };
}
export const trips: Trip[] = [];
for (let m = 2, i = 0; i < 420; i++) {
  trips.push(makeTrip(m));
  m += i < 30 ? int(1, 3) : int(4, 26);
}
for (const s of ["searching", "searching", "searching", "no_car"] as const) trips.push(makeTrip(int(1, 9), s));
// Newest first, numbered in the order they were requested.
trips.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
trips.forEach((t, i) => {
  const n = 48210 - i;
  t.id = `trip_${n}`;
  t.ref = `C-${n}`;
});

export const disputes: Dispute[] = trips
  .filter((t) => t.status === "completed")
  .filter((_, i) => i % 19 === 3)
  .slice(0, 22)
  .map((t, i) => ({
    id: `d${pad(i + 1, 3)}`,
    ref: `L-${pad(3120 - i, 4)}`,
    tripId: t.id,
    riderId: t.riderId,
    allyId: t.allyId,
    reason: pick(["overcharged", "route", "behaviour", "lost_item", "no_show", "payment"] as const),
    stage: i < 4 ? "open" : i < 8 ? "investigating" : i < 10 ? "awaiting_rider" : chance(0.5) ? "refunded" : "resolved",
    amount: chance(0.6) ? round(t.charged * (0.2 + rnd() * 0.8), 100) : 0,
    openedAt: ago((i * 9 + int(1, 8)) * HOUR),
    assignee: i < 4 ? null : pick(["Nadège E.", "Boris T.", "Carine M."]),
    note: "",
  }));

export const alerts: Alert[] = [
  { id: "al1", kind: "sos", severity: "high", subject: `${allies[3].firstName} ${allies[3].lastName}`, subjectHref: `/dashboard/allies/${allies[3].id}`, openedAt: ago(4 * MIN), status: "open", detail: "Bouton SOS pressé pendant la course " + trips[2].ref + "." },
  { id: "al2", kind: "fatigue", severity: "high", subject: `${allies[17].firstName} ${allies[17].lastName}`, subjectHref: `/dashboard/allies/${allies[17].id}`, openedAt: ago(38 * MIN), status: "open", detail: "11 h 20 de conduite sur les 14 dernières heures." },
  { id: "al3", kind: "offline", severity: "medium", subject: vehicles[8].plate, subjectHref: `/dashboard/vehicles/${vehicles[8].id}`, openedAt: ago(52 * MIN), status: "open", detail: "Plus de position depuis 52 min alors que l'Allié est en service." },
  { id: "al4", kind: "document_expiring", severity: "medium", subject: vehicles[12].plate, subjectHref: `/dashboard/vehicles/${vehicles[12].id}`, openedAt: ago(3 * HOUR), status: "acknowledged", detail: "Vignette : expire dans 6 jours." },
  { id: "al5", kind: "wallet_debt", severity: "low", subject: `${riders[44].firstName} ${riders[44].lastName}`, subjectHref: `/dashboard/riders/${riders[44].id}`, openedAt: ago(5 * HOUR), status: "open", detail: "Portefeuille à −4 500 FCFA après une course annulée tardivement." },
  { id: "al6", kind: "speeding", severity: "medium", subject: vehicles[30].plate, subjectHref: `/dashboard/vehicles/${vehicles[30].id}`, openedAt: ago(7 * HOUR), status: "open", detail: "112 km/h relevés sur le boulevard de la Liberté (limite 60)." },
  { id: "al7", kind: "driver_report", severity: "low", subject: `${allies[51].firstName} ${allies[51].lastName}`, subjectHref: `/dashboard/allies/${allies[51].id}`, openedAt: ago(26 * HOUR), status: "closed", detail: "Signale un bruit au freinage, voiture " + vehicles[51 % 62].plate + "." },
  { id: "al8", kind: "offline", severity: "low", subject: vehicles[40].plate, subjectHref: `/dashboard/vehicles/${vehicles[40].id}`, openedAt: ago(30 * HOUR), status: "closed", detail: "Téléphone hors ligne 25 min." },
];

const SUBJECTS = ["Course facturée deux fois", "Objet oublié dans la voiture", "Le chauffeur n'est jamais arrivé", "Recharge du portefeuille non reçue", "Demande de facture", "Changer mon numéro", "Retard à l'aéroport", "Remboursement promis"];
export const conversations: Conversation[] = Array.from({ length: 16 }, (_, i) => {
  const r = riders[i * 7 + 3];
  const trip = trips.find((t) => t.riderId === r.id) ?? trips[i + 10];
  const subject = SUBJECTS[i % SUBJECTS.length];
  const updated = (i * 23 + int(1, 20)) * MIN;
  return {
    id: `conv${pad(i + 1, 3)}`,
    riderId: r.id,
    allyId: null,
    channel: pick(["whatsapp", "whatsapp", "app", "phone", "email"] as const),
    subject,
    status: i < 5 ? "waiting" : i < 11 ? "open" : "closed",
    assignee: i < 5 ? null : pick(["Nadège E.", "Boris T.", "Carine M."]),
    updatedAt: ago(updated),
    unread: i < 5 ? int(1, 4) : 0,
    tripId: trip?.id ?? null,
    messages: [
      { id: "m1", from: "customer", author: `${r.firstName} ${r.lastName}`, at: ago(updated + 40 * MIN), body: `Bonjour, ${subject.toLowerCase()} (course ${trip?.ref ?? ""}).` },
      { id: "m2", from: "system", author: "Confiance", at: ago(updated + 39 * MIN), body: "Merci, un conseiller vous répond dans quelques minutes." },
      ...(i >= 5 ? [{ id: "m3", from: "agent" as const, author: "Support Confiance", at: ago(updated + 20 * MIN), body: "Bonjour, je regarde votre course tout de suite." }] : []),
      { id: "m4", from: "customer", author: `${r.firstName} ${r.lastName}`, at: ago(updated), body: i % 2 ? "Merci de faire vite, s'il vous plaît." : "J'attends votre retour." },
    ],
  };
});

export const orders: FinanceOrder[] = Array.from({ length: 26 }, (_, i) => ({
  id: `o${pad(i + 1, 3)}`,
  ref: `OP-2026-${pad(612 - i, 4)}`,
  beneficiary: pick(["Total Énergies Bonanjo", "Garage Moukoko & Fils", "AXA Assurances Cameroun", "Pneus Express Akwa", "Allocation Alliés", "Papeterie du Littoral", "Tradex Ndokoti"]),
  category: pick(["fuel", "maintenance", "insurance", "payroll", "allowance", "supplies"] as const),
  amount: round(int(25000, 4500000), 500),
  status: i < 5 ? "pending_approval" : i < 7 ? "draft" : i < 9 ? "approved" : i === 13 ? "rejected" : "paid",
  createdBy: pick(["Rachel N.", "Hervé K.", "Mireille A."]),
  approver: i < 7 ? null : pick(["Jim B.", "Prisca O."]),
  createdAt: ago((i * 14 + int(1, 10)) * HOUR),
}));

export const invoices: Invoice[] = companies.flatMap((c, i) =>
  ["2026-07", "2026-08", "2026-09"].map((period, j) => ({
    id: `inv${i}${j}`,
    number: `FAC-${period.replace("-", "")}-${pad(i + 1, 3)}`,
    companyId: c.id,
    period,
    amount: round(int(200000, 6000000), 5000),
    status: j < 2 ? (i === 4 && j === 1 ? "overdue" : "paid") : i % 5 === 0 ? "void" : "issued",
    issuedAt: new Date(`${period}-28T09:00:00Z`).toISOString(),
  })),
);

export const refunds: Refund[] = trips
  .filter((t) => t.paymentState === "partially_refunded" || t.paymentState === "failed" || t.status === "cancelled")
  .slice(0, 14)
  .map((t, i) => ({
    id: `rf${pad(i + 1, 3)}`,
    tripId: t.id,
    riderId: t.riderId,
    amount: round(Math.max(1000, t.fare * 0.5), 100),
    status: i < 4 ? "requested" : i < 6 ? "approved" : i === 9 ? "refused" : "settled",
    requestedAt: t.requestedAt,
    reason: pick(["Trajet allongé", "Annulation par l'Allié", "Double débit", "Geste commercial"]),
  }));

export const documents: ComplianceDoc[] = [
  ...allies.slice(0, 60).flatMap((a, i) => {
    const d = (n: number) => ahead(n * DAY);
    const lic = int(-10, 600);
    return [
      { id: `doc-a${i}-l`, whose: { kind: "ally" as const, id: a.id }, which: "licence" as const, number: `PC-${int(100000, 999999)}`, expiresAt: d(lic), state: lic < 0 ? ("expired" as const) : lic < 30 ? ("expiring" as const) : i % 13 === 4 ? ("to_review" as const) : ("valid" as const) },
      { id: `doc-a${i}-c`, whose: { kind: "ally" as const, id: a.id }, which: "id_card" as const, number: `CNI-${int(1000000, 9999999)}`, expiresAt: d(int(60, 2400)), state: "valid" as const },
    ];
  }),
  ...vehicles.flatMap((v) =>
    v.papers.map((p) => {
      const days = Math.round((Date.parse(p.expiresAt) - NOW) / DAY);
      return { id: `doc-${v.id}-${p.kind}`, whose: { kind: "vehicle" as const, id: v.id }, which: p.kind, number: p.number, expiresAt: p.expiresAt, state: days < 0 ? ("expired" as const) : days < 30 ? ("expiring" as const) : ("valid" as const) };
    }),
  ),
];

export const shiftReports: ShiftReport[] = allies.slice(5, 14).map((a, i) => ({
  id: `sr${i}`,
  allyId: a.id,
  vehicleId: a.vehicleId!,
  endedAt: ago((i * 3 + 2) * HOUR),
  owed: round(int(8000, 65000), 500),
  canWork: i % 3 !== 0,
}));
export const endOfShift: EndOfShift[] = allies.slice(20, 26).map((a, i) => ({
  id: `eos${i}`,
  allyId: a.id,
  vehicleId: a.vehicleId!,
  waitingMin: int(2, 48),
  odometer: vehicles.find((v) => v.id === a.vehicleId)!.odometer,
}));

export const promos: Promo[] = [
  { id: "p1", code: "BIENVENUE", kind: "percent", value: 20, cap: 2000, uses: 1834, maxUses: null, startsAt: ago(200 * DAY), endsAt: ahead(160 * DAY), active: true },
  { id: "p2", code: "AEROPORT", kind: "fixed", value: 1500, cap: null, uses: 412, maxUses: 1000, startsAt: ago(30 * DAY), endsAt: ahead(30 * DAY), active: true },
  { id: "p3", code: "FETE2026", kind: "percent", value: 15, cap: 3000, uses: 2210, maxUses: 2500, startsAt: ago(90 * DAY), endsAt: ago(20 * DAY), active: false },
  { id: "p4", code: "VIPOFFERT", kind: "free_ride", value: 1, cap: 8000, uses: 37, maxUses: 100, startsAt: ago(10 * DAY), endsAt: ahead(50 * DAY), active: true },
  { id: "p5", code: "KRIBI10", kind: "percent", value: 10, cap: 1500, uses: 96, maxUses: null, startsAt: ago(5 * DAY), endsAt: ahead(85 * DAY), active: true },
];
export const broadcasts: Broadcast[] = [
  { id: "b1", title: "Nouveau : réservez une voiture VIP à l'heure", audience: "riders", channel: "push", status: "sent", at: ago(2 * DAY), reach: 18240 },
  { id: "b2", title: "Contrôle des pneus cette semaine", audience: "allies", channel: "sms", status: "sent", at: ago(4 * DAY), reach: 117 },
  { id: "b3", title: "Relevé mensuel disponible", audience: "companies", channel: "email", status: "scheduled", at: ahead(3 * DAY), reach: 12 },
  { id: "b4", title: "-15 % pour la fête nationale", audience: "riders", channel: "push", status: "draft", at: ahead(10 * DAY), reach: 0 },
];

export const operators: Operator[] = [
  { id: "op1", name: "Jim Bakoume", email: "jim.bakoume@confiance-app.com", level: "owner", department: "operations", lastSeenAt: ago(3 * MIN), status: "active" },
  { id: "op2", name: "Prisca Owona", email: "prisca.owona@confiance-app.com", level: "director", department: "finance", lastSeenAt: ago(2 * HOUR), status: "active" },
  { id: "op3", name: "Hervé Kamga", email: "herve.kamga@confiance-app.com", level: "super_manager", department: "fleet", lastSeenAt: ago(25 * MIN), status: "active" },
  { id: "op4", name: "Nadège Essomba", email: "nadege.essomba@confiance-app.com", level: "manager", department: "support", lastSeenAt: ago(1 * MIN), status: "active" },
  { id: "op5", name: "Boris Talla", email: "boris.talla@confiance-app.com", level: "agent", department: "support", lastSeenAt: ago(9 * MIN), status: "active" },
  { id: "op6", name: "Carine Mballa", email: "carine.mballa@confiance-app.com", level: "agent", department: "support", lastSeenAt: ago(4 * HOUR), status: "active" },
  { id: "op7", name: "Rachel Nkodo", email: "rachel.nkodo@confiance-app.com", level: "manager", department: "finance", lastSeenAt: ago(1 * DAY), status: "active" },
  { id: "op8", name: "Samuel Fotso", email: "samuel.fotso@confiance-app.com", level: "agent", department: "marketing", lastSeenAt: ago(9 * DAY), status: "suspended" },
  { id: "op9", name: "Mireille Abena", email: "mireille.abena@confiance-app.com", level: "agent", department: "finance", lastSeenAt: ago(0), status: "invited" },
];

export const zones: Zone[] = [
  ...PLACES.dla.slice(0, 10).map((n, i) => ({ id: `z-dla-${i}`, cityId: "dla", name: n, kind: n.startsWith("Aéroport") ? ("airport" as const) : ("standard" as const), surge: i === 0 ? 1.3 : i === 6 ? 1.15 : 1, allies: int(0, 14), active: true })),
  { id: "z-dla-air", cityId: "dla", name: "Aéroport de Douala", kind: "airport", surge: 1, allies: 6, active: true },
  { id: "z-dla-port", cityId: "dla", name: "Port (zone réservée)", kind: "restricted", surge: 1, allies: 0, active: true },
  ...PLACES.yde.slice(0, 8).map((n, i) => ({ id: `z-yde-${i}`, cityId: "yde", name: n, kind: n.startsWith("Aéroport") ? ("airport" as const) : ("standard" as const), surge: 1, allies: int(0, 9), active: true })),
  ...PLACES.kbi.slice(0, 4).map((n, i) => ({ id: `z-kbi-${i}`, cityId: "kbi", name: n, kind: "standard" as const, surge: 1, allies: int(0, 4), active: i !== 3 })),
];

export const audit: AuditEvent[] = Array.from({ length: 60 }, (_, i) => {
  const actor = pick(operators.slice(0, 7)).name;
  const [action, target, detail] = pick([
    ["trip.reassigned", trips[int(0, 40)].ref, "Course confiée à un autre Allié"],
    ["ally.suspended", allies[int(0, 100)].badge, "Documents expirés"],
    ["refund.approved", `RF-${int(100, 999)}`, "Remboursement validé"],
    ["vehicle.off_road", vehicles[int(0, 60)].plate, "Mise hors route : entretien"],
    ["tier.prices_changed", "Plus", "Prix au km 330 → 350"],
    ["operator.invited", "mireille.abena@confiance-app.com", "Niveau Agent, Finance"],
    ["promo.created", "KRIBI10", "10 %, plafond 1 500"],
    ["company.credit_changed", companies[int(0, 11)].name, "Limite de crédit relevée"],
    ["sign_in", "console", "Connexion"],
  ] as const);
  return { id: `ev${i}`, at: ago((i * 37 + int(0, 30)) * MIN), actor, action, target, detail };
});

export const hourlyTrips: number[] = Array.from({ length: 24 }, (_, h) => {
  const curve = [2, 1, 1, 1, 2, 6, 14, 26, 31, 22, 18, 19, 24, 21, 17, 18, 23, 30, 34, 27, 19, 13, 8, 4][h];
  return Math.max(0, curve + int(-3, 3));
});
export const dailyRevenue: number[] = Array.from({ length: 14 }, () => round(int(1800000, 3600000), 10000));
