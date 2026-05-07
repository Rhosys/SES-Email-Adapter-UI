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
  - **CRITICAL — no JavaScript requirement:** marketing page must be fully functional and readable
    with JS disabled; use progressive enhancement only. All content, navigation, and CTAs must
    render server-side. No hydration errors permitted.
  - **SEO / AISEO:** semantic HTML5 landmarks, structured data (JSON-LD: `SoftwareApplication`,
    `FAQPage`, `BreadcrumbList`), canonical URLs, `hreflang` if multi-locale, `robots.txt`,
    `sitemap.xml`, `llms.txt` (plain-text summary for AI crawlers), and an `/llms-full.txt` with
    the complete feature set for LLM indexing. Optimise `<title>`, `<meta description>`, and OG
    tags per page. Target Core Web Vitals green on mobile.
- [ ] Set up favicon and Open Graph meta tags

- [ ] **Documentation site** — add a `/docs` section (or subdomain) with:
  - Human-readable guides for every feature (rules, quarantine, labels, search, settings, onboarding)
  - **LLM pages:** `/docs/llms.txt` (concise feature index) and `/docs/llms-full.txt` (full
    structured reference). Both must be plain text, no JS, and updated whenever features change.
    These are consumed by AI assistants and search crawlers.
  - OpenAPI / API reference page auto-generated from the backend spec
  - All doc pages must be statically rendered (SSG or SSR), indexable, and JS-free

- [ ] **Inline feature explanations** — every view and complex UI element must explain itself
  without redirecting to external documentation:
  - Empty states describe what the feature does and how to get started (not just "nothing here")
  - Tooltip or `<details>` disclosure on every non-obvious control (filter mode options, DNS record
    types, rule operators, quarantine actions, etc.)
  - Onboarding hints that persist until dismissed (not one-shot toasts)
  - No "see docs" or "learn more" links as the primary explanation — docs links are supplementary

- [ ] **Responsive design & mobile optimisation** — every screen must work at all viewport sizes:
  - Mobile-first CSS: design and test at 320 px, 375 px, 390 px before scaling up
  - Sidebar collapses to a bottom tab bar or hamburger drawer on narrow viewports (`< 640 px`)
  - All tables/lists degrade gracefully (no horizontal scroll traps, stack to cards on mobile)
  - Touch targets ≥ 44 × 44 px; tap-friendly spacing on all interactive elements
  - **Playwright responsive test suite** covering every route at: 320 px, 390 px (iPhone 14),
    768 px (iPad), 1280 px (laptop), 1920 px (desktop). Tests must assert:
    - No horizontal overflow at any breakpoint
    - Sidebar/nav is reachable (visible or togglable)
    - Forms, buttons, and key actions are usable without zoom
    - Text is legible (no overflow or clipping)
  - Add Playwright viewport matrix to CI so a new breakpoint regression blocks the build

- [ ] Add a top of page search bar

- [ ] **Modular component system + LLM-composable layouts** — decompose every view into a registry of self-describing, slot-composable components so that an LLM can produce a valid layout tree for any view and users can save a custom layout per view:

  ### Component registry & descriptor format

  - Every leaf UI component (arc row, signal card, stat chip, filter bar, label chip, DNS record row, etc.) must be registered in a central `src/components/registry.ts` with a machine-readable descriptor:
    ```ts
    export interface ComponentDescriptor {
      id: string              // e.g. 'arc-row', 'signal-card', 'stat-chip'
      displayName: string
      description: string     // plain-English purpose, consumed by LLM prompts
      props: PropDescriptor[] // name, type, required, default, enum values
      slots?: string[]        // named slots the component exposes
      accepts?: string[]      // component IDs that can be placed in its slots
    }
    ```
  - Components declare their own descriptor via a `defineComponentMeta()` helper so the registry is always in sync with the component file — no separate manifest to maintain
  - Serve `public/component-registry.json` (generated at build time from the registry) so an LLM running entirely in the browser can read the available components without any server round-trip

  ### Layout schema

  - Each view has exactly one layout. A layout is a serialisable tree of component instances:
    ```ts
    export interface LayoutNode {
      componentId: string          // must match a registered descriptor ID
      props?: Record<string, unknown>
      slots?: Record<string, LayoutNode[]>  // named slot → child nodes
    }
    export interface ViewLayout {
      viewId: string              // 'system:inbox' | 'system:all' | 'system:quarantine' | SavedView.id
      nodes: LayoutNode[]         // top-level component tree
      updatedAt: string
    }
    ```
  - Validate every `LayoutNode` against the registry before rendering (unknown `componentId` → fallback placeholder, type-mismatched props → stripped with console warning)
  - Add `ViewLayout` and `LayoutNode` to `src/types/server.ts`

  ### LLM layout suggestion flow (browser-only)

  - "Customise this view" button opens a prompt textarea: user describes the layout they want in plain English
  - The browser fetches `public/component-registry.json` and passes it alongside the prompt to the browser's built-in LLM (`window.LanguageModel ?? window.ai?.languageModel`); **if no browser LLM is available the feature is not shown** — there is no server-side generation fallback
  - The LLM is prompted to return a JSON `LayoutNode[]` tree; the frontend validates it against the registry and renders a live preview
  - User can accept (saves via `PUT .../layout`) or cancel
  - If the suggested layout references unknown components, surface a diff UI showing what was ignored

  ### Layout persistence API (backend TODOs)

  > **Sync required:** copy these TODOs into `rhosys/ses-email-adapter` (`TODO.md`) under a "Modular layout persistence" section.

  - Each view has exactly one layout record; use PUT (upsert) to create or replace it:
    - `GET  /accounts/:id/views/:viewId/layout` → `ViewLayout` (404 if not yet customised — frontend falls back to hard-coded render)
    - `PUT  /accounts/:id/views/:viewId/layout` → upsert layout → `ViewLayout`
    - `DELETE /accounts/:id/views/:viewId/layout` → 204, resets view to the hard-coded default
  - No backend involvement in generation — the backend stores and returns the `nodes: LayoutNode[]` tree as an opaque JSON blob; no validation of component IDs server-side (that is the frontend's job)
  - **Hard-coded system views** (`inbox`, `all`, `quarantine`) must become first-class view records in the DB so they can own a layout; seed them as undeletable rows:
    - `{ id: 'system:inbox',      name: 'Inbox',      type: 'system', filter: { status: 'active' } }`
    - `{ id: 'system:all',        name: 'All',        type: 'system', filter: {} }`
    - `{ id: 'system:quarantine', name: 'Quarantine', type: 'system', filter: { status: 'quarantined' } }`
  - `DELETE` on a system view record must return 403; `DELETE` on its layout is allowed (resets to hard-coded render)

  ### Frontend rendering engine

  - `<DynamicLayout :nodes="layout.nodes" />` — recursive renderer that looks up each `componentId` in the registry, resolves the Vue component, passes `props`, and fills named slots with child `<DynamicLayout>` calls
  - Wrap in an `<ErrorBoundary>` so a bad node crashes only its subtree, not the whole view
  - If no layout exists for a view (404 from the API), fall back to the hard-coded Vue template (zero regression for current users)
  - "Customise" / "Reset to default" buttons in the view header

  ### Decomposition work (prerequisite)

  - Audit every view and extract repeated or independently useful markup into registered components; target components include (non-exhaustive):
    - `ArcRow`, `ArcRowCompact`, `SignalCard`, `SignalCardCollapsed`
    - `LabelChip`, `ActionBadge`, `UrgencyStripe`, `WorkflowIcon`
    - `FilterBar`, `SenderFilter`, `DateRangeFilter`, `StatusTabBar`
    - `StatChip`, `PaginationBar`, `EmptyState`, `LoadingSpinner`
    - `DnsRecordRow`, `TeamMemberRow`, `AuditEventRow`
    - `RuleConditionBuilder`, `RuleActionSelector`
  - Each extracted component must have a `defineComponentMeta()` call and appear in the registry before the layout engine can use it

- [ ] **AI-powered "code" rule action** — let users describe rule logic in plain language; the browser's built-in LLM generates the JavaScript predicate that is stored and executed at match time. **If the browser has no built-in LLM the feature is not shown — there is no server-side generation fallback.**
  - **New action type:** add `'code'` to `RuleAction` union; add `code?: string` (generated JS predicate) to `Rule`, `CreateRuleBody`, and `UpdateRuleBody` — the human-language prompt is a transient frontend-only value, never persisted
  - **UI in `RuleEditorView.vue`:** when action = `'code'`, show a textarea for the natural-language prompt and a "Generate" button; show the generated JS in a read-only code block for review before saving; if `window.LanguageModel ?? window.ai?.languageModel` is absent, hide the action option entirely
  - **Browser LLM check:** `window.LanguageModel ?? window.ai?.languageModel` (Chrome 127+ Gemini Nano); the same API surface works on Chrome for Android / Samsung Internet so no UA sniffing is needed — the capability check is sufficient
  - **Generated JS predicate shape:** a single-argument arrow function `(signal) => boolean`; example: `(signal) => signal.from.address.endsWith('@example.com') && signal.subject.includes('invoice')`
  - **Security — sandbox generated code before execution:** NEVER `eval()` or `new Function()` in the main thread; run inside a `Worker` with a strict `postMessage` interface; document this constraint in a code comment
  - **Auto-label:** after saving a code rule, automatically apply (or create) an `ai-generated` system label on the rule so it is visually distinct in the Rules list
  - **Backend TODOs for this feature:**
    - Add `code?: string` to the Rule schema in the DB and API response (no `prompt` field — that is frontend-only)
    - Validate/sandbox the `code` field server-side before storing (parse to AST, reject unsafe nodes)
    - Ensure the rule executor runs `code` predicates in an isolated VM context (not raw `eval`)

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
