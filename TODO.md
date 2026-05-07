# SES Email Adapter UI — Build Plan

## Open tasks

- [x] Reconcile API client against backend breaking changes (see "API Breaking Changes" below)
- [x] Implement Phase 5 — Quarantine view
- [x] Implement Phase 6 — Labels & views
- [x] Implement Phase 7 — Rules engine
- [x] Implement Phase 8 — Search
- [x] Implement Phase 9 — Settings
- [x] Implement Phase 10 — Secondary screens
- [x] Implement Phase 2 — Onboarding flow
- [ ] Write marketing homepage copy (value prop, screenshots, CTA) — redirect to app if already logged in
  - **Requires Vue/Vite SSR** (e.g. `vite-plugin-ssr` / Vike, or Nuxt) so the marketing page is
    server-rendered for SEO and fast first-paint; the authenticated app shell can remain a pure SPA.
    Current project is SPA-only — SSR setup is a prerequisite before building this page.
- [ ] Set up favicon and Open Graph meta tags
- [ ] Add a top of page search bar

---

This document is the working specification for the Vue 3 frontend that talks to
the `ses-email-adapter` API. It is the canonical source for what's in scope and
the order in which features land.

The authoritative product spec lives in `rhosys/ses-email-adapter` on branch
`claude/build-ai-app-ECGgR` (`TODO.md`). When that document changes, sync the
UI section into this file and re-export `src/types/server.ts` from the server's
`src/types/index.ts`.

---

## API Breaking Changes — must reconcile before shipping

The backend API was modernized after the UI scaffolding was written. The current
`src/lib/api.ts` uses the old shapes. Full reference is in `../backend/TODO.md`
under "API Breaking Changes". Summary of what affects the site:

### Collection envelope

All list calls now return named collections, not `{ items, total }`:

```ts
// Current (wrong)
const { items, nextCursor, total } = await api.listArcs(...)

// Correct
const { arcs, pagination } = await api.get<{ arcs: Arc[]; pagination: { cursor: string | null } }>('/arcs')
```

Affected endpoints: `GET /arcs`, `GET /arcs/:id/signals`, and all future list
endpoints (`/views`, `/labels`, `/rules`, `/domains`, `/aliases`, `/users`,
`/forwarding-addresses`, `/search`).

Cursor pagination: `nextCursor` is gone. Use `pagination.cursor` (always
present, `null` means end of list). `total` is also gone.

### Error shape

```ts
// Current (wrong)
{ error: string }

// Correct
{ title: string; errorCode?: string; details?: unknown }
```

### Mutations return full resource

All PATCH and POST calls return the created/updated resource. The site already
does this correctly (stores use the response body directly).

### Aliases: PUT → PATCH, new POST

```
POST  /aliases          → create (409 if duplicate)
PATCH /aliases/:address → partial update / upsert (was PUT)
DELETE /aliases/:address → 204 No Content (was 200)
```

### New signal draft endpoints (needed for Phase 4 reply composer)

```
PATCH  /signals/:id       → update draft fields
POST   /signals/:id/send  → send draft
DELETE /signals/:id       → discard draft
```

The reply composer in `ReplyComposer.vue` is currently disabled pending these
endpoints being available.

---

## Tech stack

- **Framework:** Vue 3 + `<script setup>` + TypeScript
- **Build:** Vite 6
- **Routing:** Vue Router 4
- **State:** Pinia
- **Styling:** Tailwind CSS 4 (`@tailwindcss/vite`) themed with Catppuccin
  (Latte, Frappé, Macchiato, Mocha)
- **Auth:** `@authress/login`
- **Testing:** Vitest + `@vue/test-utils` (unit + component), Playwright (E2E)
- **Deploy:** static `dist/` bundle uploaded to S3

---

## Phase 1 — Project bootstrap ✓ DONE

- Vite + Vue + TS scaffold, path alias `@ → src`
- Vue Router with placeholder routes
- Pinia stores: `account`, `arcs`, `theme`
- `@authress/login` wired into the account store (login redirect on 401)
- Typed fetch-based API client (`src/lib/api.ts`) with neverthrow Result types
- App shell: top bar, sidebar, main outlet
- Catppuccin theme system: 4 flavors as CSS custom properties, persisted via
  the theme store, applied to `<html data-theme="…">`
- Vitest + Playwright configs and seed tests (component + e2e + style/color)
- ESLint 10 flat config + Prettier

## Phase 3 — Core inbox ✓ DONE

- Arc list (cursor-paginated) at `/`
- Per-row: urgency color stripe, workflow icon, summary, last-signal age, label chips
- Auth+critical arcs pinned to top of Inbox view
- Status tabs: Inbox (active) / Archived / All
- Bulk select + bulk archive + bulk label
- Empty / loading / error states
- `npm run check` gate: typecheck + ESLint (flat config) + Prettier + 39 unit/component tests

## Phase 4 — Arc detail ✓ DONE

- Route `/arcs/:id` with back navigation from arc rows
- Signals store: fetches arc + signals in parallel, newest-first display, cursor pagination
- Threaded signal list in `SignalCard.vue` (collapsible, sandboxed iframe, spam warning)
- Workflow-specific data panels for all 14 workflows (`src/components/panels/`)
  — auth, conversation, crm, package, travel, scheduling, payments, alert,
  content, status, healthcare, job, support, test
- `WorkflowPanel.vue` dispatcher (discriminated union narrowing via `workflow` field)
- `useCountdown.ts` composable (1s interval, urgency levels: safe/warning/critical/expired)
- `useClipboard.ts` composable (2s reset, silent failure)
- Reply composer (`ReplyComposer.vue`) — UI present, send disabled pending draft API
- Archive action on arc detail
- `npm run check` gate: all 56 tests pass

## Phase 5 — Quarantine view ✓ DONE

- Route `/quarantine`
- `GET /accounts/:id/signals?status=quarantined` with sender/date filters
- Untrusted-sender branch (`signal.matchedRules[].labels` contains `system:sender:untrusted`): Allow / Block buttons calling `POST .../quarantineResponse { status: 'active'|'blocked' }`
- Matched-rules branch: router-links to `/rules/new?signalId=...&action=allow|block` and `/rules/:id?signalId=...`
- Filter by sender, date range; cursor pagination with Load more

### Backend TODOs for Phase 5

- **`Signal.matchedRules`** — `matchedRules?: RuleExecution[]` already modelled in `src/types/server.ts`; backend must include it in the quarantine list response.
- **`POST .../quarantineResponse`** — must resolve the signal and return the updated Signal.
- **`EmailAddressConfig.blockedSenders`** — add `blockedSenders?: string[]` to alias config and support in `PATCH /aliases/:address`.

## Phase 6 — Labels & views ✓ DONE

- `/labels` view with tabs: Labels (CRUD, color, icon picker) and Views (saved searches)
- Sidebar shows custom views with drag-to-reorder (HTML5 DnD, PATCH order on drop)
- Stores: `useLabelsStore`, `useViewsStore`

### Backend TODOs for Phase 6

- `GET/POST/PATCH/DELETE /accounts/:id/labels`
- `GET/POST/PATCH/DELETE /accounts/:id/views`

## Phase 7 — Rules engine ✓ DONE

- `/rules` list with action badges and condition summary
- `/rules/new` and `/rules/:id` — visual condition builder (field × operator × value), action selector, client-side rule tester
- Pre-fills from quarantine `?signalId=&action=` query params; resolves signal via `quarantineResponse` after save

### Backend TODOs for Phase 7

- `GET/POST/PATCH/DELETE /accounts/:id/rules`

## Phase 8 — Search ✓ DONE

- `/search` — single query input, parallel searches across arcs, aliases, and rules
- Section visibility toggles as styled pill chips (at least one section always visible)
- Results appear in labelled sections

## Phase 9 — Settings ✓ DONE

- `/settings` with 6 tabs: Account, Email addresses, Domains, Forwarding, Team, Notifications
- DNS two-tier display: type badge + host + value + per-record status
- Team: invite, role picker, remove
- Notifications: toggle + address + frequency

### Backend TODOs for Phase 9

- `GET/POST/PATCH/DELETE /accounts/:id/aliases`
- `GET/POST /accounts/:id/domains`
- `GET/POST/DELETE /accounts/:id/forwarding-addresses`
- `GET/POST/PATCH/DELETE /accounts/:id/users`

## Phase 10 — Secondary screens ✓ DONE

- `/profile` — account name, ID, sign-out
- `/billing` — plan display, portal link
- `/audit-log` — paginated event list with type icons
- `/terms` and `/privacy` — legal pages (standalone, no sidebar)
- Notification preferences on settings Notifications tab

## Phase 2 — Onboarding flow ✓ DONE

Five-step wizard at `/onboarding` (standalone, no sidebar):

1. **Domain** — enter domain, see DNS records
2. **Test email** — 3-second polling to detect first signal
3. **Sender address** — creates alias via `POST /aliases`
4. **Filter mode** — four options with recommended highlight
5. **Done** — recap card with step completion summary, link to inbox

---

## Testing strategy

- **Unit (Vitest, jsdom):** composables, stores, pure helpers (e.g. urgency →
  color mapping, JSONLogic emitter).
- **Component (Vitest + @vue/test-utils):** rendered output, Tailwind classes,
  ARIA, event emission.
- **E2E (Playwright):**
  - **Behavioral:** real user flows — log in, archive an arc, send a reply,
    walk the onboarding wizard end-to-end.
  - **Style / color:** assert computed colors per Catppuccin flavor so theme
    regressions are caught (e.g. high-urgency badge resolves to mauve in
    Mocha, lavender in Latte).

## Conventions

- All views in `src/views/*View.vue`, all reusable pieces in `src/components/`
- Stores own the network calls; views read state and dispatch actions
- `src/lib/api.ts` is the only place `fetch` is called
- All API calls return `Result<T, ApiError>` via neverthrow — stores branch on
  `.isOk()/.isErr()`, no try/catch at the store layer
- New colors and tokens go through the Catppuccin palette — never hard-code
  hex values in components
