// The rail's groups and pages. Keys index messages console.nav.*.
export type NavItem = { key: string; href: string; badge?: "alerts" | "support" | "disputes" | "approvals" };
export type NavGroup = { key: string; items: NavItem[] };

export const nav: NavGroup[] = [
  {
    key: "operations",
    items: [
      { key: "overview", href: "/dashboard" },
      { key: "map", href: "/dashboard/map" },
      { key: "trips", href: "/dashboard/trips" },
      { key: "alerts", href: "/dashboard/alerts", badge: "alerts" },
      { key: "support", href: "/dashboard/support", badge: "support" },
      { key: "disputes", href: "/dashboard/disputes", badge: "disputes" },
    ],
  },
  {
    key: "people",
    items: [
      { key: "allies", href: "/dashboard/allies" },
      { key: "riders", href: "/dashboard/riders" },
      { key: "companies", href: "/dashboard/companies" },
    ],
  },
  {
    key: "fleet",
    items: [
      { key: "vehicles", href: "/dashboard/vehicles" },
      { key: "rota", href: "/dashboard/rota" },
      { key: "documents", href: "/dashboard/documents" },
    ],
  },
  {
    key: "money",
    items: [{ key: "finance", href: "/dashboard/finance", badge: "approvals" }],
  },
  {
    key: "growth",
    items: [
      { key: "tiers", href: "/dashboard/tiers" },
      { key: "marketing", href: "/dashboard/marketing" },
    ],
  },
  {
    key: "admin",
    items: [
      { key: "settings", href: "/dashboard/settings" },
      { key: "audit", href: "/dashboard/audit" },
    ],
  },
];
