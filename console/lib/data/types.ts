// Domain model the console's pages read. Shapes follow what the live console shows and refuses
// (column sets in its stylesheet, its refusal catalogue in messages/live/*/errors).

export type ID = string;

export type City = { id: ID; name: string; timezone: string; isDefault: boolean; lat: number; lng: number; active: boolean };

export type TierCode = "pro" | "plus" | "vip";
export type Tier = {
  id: ID;
  code: TierCode;
  name: string;
  order: number;
  seats: number;
  fleet: number;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  switches: { rides: boolean; rentals: boolean; airport: boolean; companies: boolean };
  active: boolean;
};

export type AllyState = "on_trip" | "available" | "on_break" | "off_shift" | "suspended" | "left";
export type AllyRole = "titulaire" | "relief";
export type Ally = {
  id: ID;
  badge: string;
  firstName: string;
  lastName: string;
  phone: string;
  cityId: ID;
  tier: TierCode;
  rating: number;
  state: AllyState;
  role: AllyRole;
  trips: number;
  tripsThisMonth: number;
  joinedAt: string;
  lastActiveAt: string;
  vehicleId: ID | null;
  earningsThisMonth: number;
  acceptance: number;
  fatigueOpen: boolean;
  lat: number;
  lng: number;
};

export type Loyalty = "none" | "silver" | "gold" | "platinum";
export type IdentityState = "verified" | "pending" | "unverified" | "rejected";
export type Rider = {
  id: ID;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  memberSince: string;
  loyalty: Loyalty;
  cityId: ID;
  identity: IdentityState;
  trips: number;
  wallet: number;
  lastTripAt: string | null;
  companyId: ID | null;
  status: "active" | "deactivated" | "blacklisted";
};

export type BillingMode = "prepaid" | "credit";
export type Company = {
  id: ID;
  name: string;
  accountId: string;
  cityId: ID;
  billingMode: BillingMode;
  creditLimit: number;
  prepaidBalance: number;
  owed: number;
  riders: number;
  tripsThisMonth: number;
  spendThisMonth: number;
  status: "active" | "suspended";
  billingEmail: string;
  since: string;
};

export type RoadState = "on_road" | "off_road" | "in_preparation" | "left_fleet";
export type PaperKind = "insurance" | "vignette" | "inspection" | "registration";
export type Paper = { kind: PaperKind; number: string; expiresAt: string };
export type Vehicle = {
  id: ID;
  plate: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  vin: string;
  tier: TierCode;
  cityId: ID;
  road: RoadState;
  odometer: number;
  papers: Paper[];
  allyIds: ID[];
  restDays: number[];
  lastServiceAt: string;
};

export type TripStatus = "searching" | "assigned" | "arriving" | "in_progress" | "completed" | "cancelled" | "no_car";
export type TripType = "ride" | "rental" | "airport" | "company";
export type PaymentMethod = "cash" | "wallet" | "card" | "mobile_money" | "company";
export type PaymentState = "paid" | "pending" | "failed" | "refunded" | "partially_refunded";
export type Trip = {
  id: ID;
  ref: string;
  requestedAt: string;
  status: TripStatus;
  type: TripType;
  tier: TierCode;
  allyId: ID | null;
  riderId: ID;
  companyId: ID | null;
  cityId: ID;
  pickup: string;
  dropoff: string;
  distanceKm: number;
  durationMin: number;
  fare: number;
  charged: number;
  payment: PaymentMethod;
  paymentState: PaymentState;
  waitMin: number;
  rating: number | null;
  cancelReason: string | null;
};

export type DisputeStage = "open" | "investigating" | "awaiting_rider" | "resolved" | "refunded";
export type Dispute = {
  id: ID;
  ref: string;
  tripId: ID;
  riderId: ID;
  allyId: ID | null;
  reason: "overcharged" | "route" | "behaviour" | "lost_item" | "no_show" | "payment";
  stage: DisputeStage;
  amount: number;
  openedAt: string;
  assignee: string | null;
  note: string;
};

export type AlertKind = "sos" | "fatigue" | "offline" | "document_expiring" | "wallet_debt" | "speeding" | "driver_report";
export type Alert = {
  id: ID;
  kind: AlertKind;
  severity: "high" | "medium" | "low";
  subject: string;
  subjectHref: string | null;
  openedAt: string;
  status: "open" | "acknowledged" | "closed";
  detail: string;
};

export type Message = { id: ID; from: "customer" | "agent" | "system"; author: string; at: string; body: string };
export type Conversation = {
  id: ID;
  riderId: ID | null;
  allyId: ID | null;
  channel: "whatsapp" | "app" | "phone" | "email";
  subject: string;
  status: "waiting" | "open" | "closed";
  assignee: string | null;
  updatedAt: string;
  unread: number;
  tripId: ID | null;
  messages: Message[];
};

export type OrderStatus = "draft" | "pending_approval" | "approved" | "paid" | "rejected";
export type FinanceOrder = {
  id: ID;
  ref: string;
  beneficiary: string;
  category: "fuel" | "maintenance" | "insurance" | "payroll" | "allowance" | "supplies";
  amount: number;
  status: OrderStatus;
  createdBy: string;
  approver: string | null;
  createdAt: string;
};
export type Invoice = {
  id: ID;
  number: string;
  companyId: ID;
  period: string;
  amount: number;
  status: "issued" | "paid" | "overdue" | "void";
  issuedAt: string;
};
export type Refund = {
  id: ID;
  tripId: ID;
  riderId: ID;
  amount: number;
  status: "requested" | "approved" | "settled" | "refused";
  requestedAt: string;
  reason: string;
};

export type DocWhose = { kind: "ally"; id: ID } | { kind: "vehicle"; id: ID };
export type DocKind = "licence" | "id_card" | "criminal_record" | PaperKind;
export type ComplianceDoc = {
  id: ID;
  whose: DocWhose;
  which: DocKind;
  number: string;
  expiresAt: string;
  state: "valid" | "expiring" | "expired" | "to_review";
};

export type ShiftReport = { id: ID; allyId: ID; vehicleId: ID; endedAt: string; owed: number; canWork: boolean };
export type EndOfShift = { id: ID; allyId: ID; vehicleId: ID; waitingMin: number; odometer: number };

export type Promo = {
  id: ID;
  code: string;
  kind: "percent" | "fixed" | "free_ride";
  value: number;
  cap: number | null;
  uses: number;
  maxUses: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
export type Broadcast = {
  id: ID;
  title: string;
  audience: "riders" | "allies" | "companies";
  channel: "push" | "sms" | "email";
  status: "draft" | "scheduled" | "sent";
  at: string;
  reach: number;
};

export type OperatorLevel = "owner" | "director" | "super_manager" | "manager" | "agent";
export type Operator = {
  id: ID;
  name: string;
  email: string;
  level: OperatorLevel;
  department: "operations" | "support" | "finance" | "fleet" | "marketing";
  lastSeenAt: string;
  status: "active" | "invited" | "suspended";
};

export type Zone = { id: ID; cityId: ID; name: string; kind: "standard" | "airport" | "restricted"; surge: number; allies: number; active: boolean };

export type AuditEvent = { id: ID; at: string; actor: string; action: string; target: string; detail: string };

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
