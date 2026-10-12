# Journal Admin (prototype)

Staff-only admin dashboard for the EdTech Publishers journals (IJMAT, JIMRT, IJCSD, IJECM, IJFRD). Front end only: all data is mock data behind a fake async API (`src/mock/api`, 300–800 ms latency). Authors and readers never sign in here.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint
npm run typecheck
```

Copy `.env.example` to `.env` if you need to change anything. `VITE_API_BASE_URL` is unused until the real API exists. `VITE_PROTOTYPE=true` shows the floating "Prototype controls" panel (switch user, flags, reset); it is hidden by default. **Help → Reset demo data** restores the seed data at any time.

## Demo users (password `demo`)

| User | Access |
| --- | --- |
| Priya Menon | Super Admin, all journals (asks for a 2-step code; any 6 digits work) |
| Rohan Mehta | Editor in IJMAT and IJCSD |
| Neha Kapoor | Associate Editor in JIMRT |
| Karan Shah | Editor in IJMAT, Associate Editor in JIMRT (switch journal to change role) |
| Dr. Ananya Iyer | Reviewer in IJMAT |
| Dr. Sofia Alvarez | Review Panel Member in IJECM (feature flag `reviewPanel`) |
| Isha Desai | Support Staff in IJMAT and JIMRT |

## Deploy to Vercel

`vercel.json` is included (Vite framework, SPA rewrite so deep links such as `/submissions/IJMAT2026000100` work after a refresh, long-term caching for `/assets`, security headers, `noindex`). Import the `admin` folder as the project root; no environment variables are required. To serve under a sub-path, set `VITE_BASE_PATH` at build time.

## Structure

```
src/
  app/          routes, guards, error pages
  layout/       Sidebar, Topbar, JournalSwitcher, CommandPalette, PageHeader, PrototypeControls
  permissions/  roles, permission matrix (config), hooks, RouteGuard, feature flags
  navigation/   navigation config driven by permissions
  pages/        one folder per area (dashboard, editorial, production, publishing, finance,
                communication, website, insights, admin) + auth
  components/   DataTable, StatusBadge, JournalBadge, KpiCard, dialogs, timeline, viewers…
  shared/       types, paperId.ts, gst.ts, formatters.ts, statuses.ts (movable to a shared package)
  mock/         seed data, api/ (fake API), stores/ (zustand), actions.ts
  lib/ styles/
```

Formats shared with the journal websites: Paper ID `{CODE}{YEAR}{6-digit}` (IJMAT2026000123), DOI `10.55041/{Paper ID}`, GST 18 % for Indian authors (CGST 9 % + SGST 9 % in-state, otherwise IGST 18 %), no GST for USD payments.

## Notes and assumptions

- The permission matrix (`src/permissions/matrix.ts`) is derived from the role descriptions in the brief; reconcile it with the architecture PDF §9 once available.
- Journal full names are placeholders; brand colours are used only for the small journal dot/badge.
- The table component is custom (typed, sortable, filterable, column chooser, saved views, selection, pagination, mobile cards) instead of TanStack Table v9, whose API has changed substantially.
