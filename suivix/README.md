# Suivix

Suivi de dossiers & pilotage d'équipe — réception et suivi de dossier.

Front end only: a React + Vite + Tailwind single-page app. All data is seeded demo data kept in the
browser's local storage (`src/lib/suivix/seed.ts`, `storage.ts`); there is no backend.

## Pages
| Route | Page |
|---|---|
| `/` | Dossiers (list, filters, new dossier) |
| `/dossiers/:id` | Dossier detail: attachments, tasks, physical tracking + QR tag, history, Word/PDF export |
| `/recherche` | Search |
| `/alertes` | Alerts |
| `/dashboards` | Dashboards (charts) |
| `/agents` | Per-agent view |
| `/kpi` | KPI & scorecards |
| `/audit` | Audit log |
| `/equipe` | Team management |
| `/parametres` | Settings |

Use "Changer de profil démo" in the sidebar to switch between demo personas and roles.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build in dist/
```

## Structure
- `src/pages/` — one file per route
- `src/components/suivix/` — app components (layout, badges, panels, dialogs)
- `src/lib/suivix/` — types, seed data, state (context), storage, notifications, export
- `src/lib/shadcn/` — UI primitives (Radix + Tailwind)
- `src/theme.css`, `src/appTheme.css` — design tokens and Suivix brand theme (Sora, IBM Plex Mono, Source Serif 4)

## Deploy
`netlify.toml` builds with `npm run build`, publishes `dist/` and rewrites every path to `index.html` for client-side routing.
