# SES Email Adapter UI — Build Plan

## Recommendations

### Power-user / interaction polish

- [x] **Toast / undo notification system** — global snackbar for destructive actions (archive, block, delete) with a 5-second undo window. No global toast system exists today; errors and successes are either silent or surfaced inline per-view only.

- [x] **Keyboard shortcuts for inbox navigation** — Gmail/Superhuman-style bindings: `j/k` move between arcs, `e` archive, `r` reply, `?` opens a shortcut reference overlay. Currently only Escape is wired anywhere; power users can't navigate at speed without a mouse.

- [x] **Browser push notifications** — frontend fully implemented: `useRealtime.ts` fires `new Notification()` on `signal:created` events, filtered by urgency. Blocked on backend WebSocket implementation (see Backend TODOs — WebSocket realtime events).

- [x] **Skeleton loaders** — every view shows plain `"Loading…"` text. Replace with layout-matching skeleton placeholders to reduce perceived load time.

### Trust & reliability

- [x] **Error tracking integration** — PostHog + relay logger (`src/lib/logger.ts`). Vue error handler, unhandled promise rejections, and router errors all flow to the logger. Session flushed on `beforeunload`. Set `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` env vars to enable PostHog in production.

- [x] **Axe-core automated a11y tests (baseline)** — WCAG 2.x AA audit on the 6 main routes (`/`, `/search`, `/quarantine`, `/labels`, `/rules`, `/settings`) in `tests/e2e/a11y.test.ts`.

### Extensibility & integrations

- [ ] **Webhooks UI in Settings** — outbound webhook subscriptions so users can pipe arc events into Slack, Discord, or Linear without writing custom code. New tab in the Settings view. Requires backend (see Backend TODOs — Webhooks).

- [ ] **API keys management** — list, create (with one-time secret reveal), and revoke keys. New tab in Settings or Profile. Requires backend (see Backend TODOs — API keys).

---

## V2 — Blocked pending app release

These are solid ideas but intentionally deferred until V1 is shipped and in users' hands.

- [ ] **Bundle-size budget in CI** — harden the existing advisory bundle-size check into a hard build failure with defined chunk and total KB limits.

- [ ] **Axe-core — extend to full route list** — extend `tests/e2e/a11y.test.ts` to cover: `/onboarding`, `/invite`, `/billing`, `/profile`, `/rules/new`, `/rules/:id`, `/arcs/:id`, `/templates`, `/audit-log`, `/terms`, `/privacy`. Add `wcag21a`, `wcag21aa`, `best-practice` tags.

- [ ] **Test coverage backfill** — the following have no tests at all:
  - Stores: `templates`, `theme`, `account`, `signals`, `views`
  - Views: `SettingsView`, `TemplatesView`, `OnboardingView`, `QuarantineView`, `ArcDetailView`

- [ ] **Modular component system + LLM-composable layouts** — decompose every view into a registry of self-describing, slot-composable components so that an LLM can produce a valid layout tree for any view and users can save a custom layout per view.

### Onboarding & engagement

- [x] **Invite accept screen** — `/invite?inviteId=<id>` route that lets a newly invited team member accept their invitation. Spec:
  - Extract `inviteId` from the URL query string; if missing or empty display "invite link is invalid" and make no SDK call.
  - When `inviteId` is present: call `loginClient.userSessionExists()` to process any OAuth callback tokens; if a session now exists the invite was accepted — redirect to `/`.
  - If no session yet: call `loginClient.authenticate({ inviteId, redirectUrl: window.location.href })` which redirects the user through the Authress login + invite-acceptance flow and returns them to this URL.
  - If `error` / `error_description` query params appear in the URL (OAuth failure return), display a specific message: "expired", "already used", or "not found" based on the `error_description` text — do not redirect.
  - If `authenticate()` throws a 4xx: display the same categorised error — do not redirect.
  - Route must be unauthenticated (no `requiresAuth` guard) so the guard doesn't redirect the user away before they can log in via the invite.
  - Add `invite` to `ROUTE_TITLES` in the router.

- [x] **First-run feature tour** — coachmark overlay (Shepherd.js or equivalent) triggered once after onboarding completes, highlighting key UI elements (rules, quarantine, labels, search). Permanently dismissible.

- [x] **Inbox-zero celebration** — small visual flourish (similar to the fireworks on the onboarding done screen) when the last arc in the inbox is archived. Cheap engagement moment.

---

## Open tasks

- [x] Reconcile API client against backend breaking changes (see "API Breaking Changes" below)

## Backend routes the frontend calls that must be implemented

These are all `// TODO(backend)` items in `src/lib/api.ts`, consolidated here so they can be ported to `rhosys/ses-email-adapter`.

### Account management

- `POST /accounts` — create a new account (required for self-service onboarding; Step 1 of the onboarding wizard calls this before any domain/alias setup can proceed)
- `GET /accounts` — list all accounts the authenticated user belongs to (needed for account switcher)

### Labels (`/accounts/:id/labels`)

- `GET` — list labels
- `POST` — create label `{ name, color?, icon? }`
- `PATCH /:labelId` — update label
- `DELETE /:labelId` — delete label

### Saved views (`/accounts/:id/views`)

- `GET` — list views
- `POST` — create view
- `PATCH /:viewId` — update view
- `DELETE /:viewId` — delete view

### Rules (`/accounts/:id/rules`)

- `GET` — list rules
- `POST` — create rule
- `PATCH /:ruleId` — update rule
- `DELETE /:ruleId` — delete rule

### Domains (`/accounts/:id/domains`)

- `GET` — list domains (POST and PATCH already implemented)

### Forwarding addresses (`/accounts/:id/forwarding-addresses`)

- `GET` — list forwarding addresses
- `POST` — create `{ address }`
- `DELETE /:id` — delete

### Team members (`/accounts/:id/users`)

- `GET` — list team members
- `POST` — invite `{ email, role }`
- `PATCH /:userId` — update role
- `DELETE /:userId` — remove

### Audit log (`/accounts/:id/audit`)

- `GET` — cursor-paginated event list; response shape: `{ events: AuditEvent[], pagination: { cursor: string | null } }`

### Email templates (`/accounts/:id/templates`)

**Resource shapes:**
```ts
interface TemplateFunction {
  name: string  // JS identifier — referenced in body as {{fn.name}}
  code: string  // full JS expression: (signal, arc) => string
}

interface EmailTemplate {
  id: string
  accountId: string
  name: string               // display name, e.g. "Order confirmation reply"
  subject: string            // email subject, may contain {{sender.name}}, {{sender.address}}, {{fn.*}}
  body: string               // markdown body, same variable set
  functions: TemplateFunction[]
  createdAt: string          // ISO 8601
  updatedAt: string          // ISO 8601
}
```

**Static variables** (always available, resolved server-side):
- `{{sender.name}}` — display name of the incoming signal's sender
- `{{sender.address}}` — email address of the sender

**Custom function outputs** (`{{fn.<name>}}`): each `TemplateFunction` is an arrow function
expression that receives `(signal, arc)` and returns a string. The backend evaluates each
function in a sandboxed VM against the live signal and arc at send time, collects the outputs
into a `fn` namespace, then performs the Handlebars pass over subject and body. Functions may
access any field on the full signal and arc objects.

**Endpoints:**
- `GET /accounts/:id/templates` → `{ templates: EmailTemplate[] }` — full list, no pagination needed initially
- `POST /accounts/:id/templates` — body `{ name, subject, body, functions }` → `EmailTemplate` (201)
- `PUT /accounts/:id/templates/:templateId` — full replace, same body shape → `EmailTemplate`
- `DELETE /accounts/:id/templates/:templateId` → 204 No Content

**Security:** user-supplied `functions[].code` must be executed in an isolated VM context
server-side (e.g. Node.js `vm.runInNewContext` with a timeout), never via raw `eval`. Validate
that each `name` is a valid JS identifier before storing.

**VM execution context:** the sandboxed VM must expose the full `signal` and `arc` objects,
including all optional fields (`signal.workflowData`, `signal.attachments`, `signal.matchedRules`,
`signal.textBody`, `signal.htmlBody`, `signal.spamScore`, `arc.urgency`, `arc.labels`, etc.).
Fields that are absent for a given signal must be `undefined` (not omitted), so user code can
safely test `signal.workflowData?.orderNumber` without a property-access error.

**Function error handling at send time:** if a function throws or times out during execution
against live data, substitute an empty string for that `fn.*` token and continue rendering —
do not abort the send/draft action. Log the error (function name + message + signal ID) for
observability. This matches what users see in the browser preview (`[Error: ...]` renders as
an empty placeholder in production so the email still goes out).

**Rule integration:** when a rule action has `type: 'auto_reply'` or `type: 'auto_draft'` and a
`templateId`, the backend:
1. Loads the template
2. Runs each function against the live signal/arc in a sandboxed VM, collecting `fn.*` outputs
   (errors substitute empty string — see above)
3. Performs a Handlebars pass over subject and body with `{ sender, fn }` context
4. Renders the markdown body to HTML (or passes raw markdown to SES depending on your pipeline)
5. Either sends immediately (`auto_reply`) or creates a draft signal (`auto_draft`) for user review

### Quarantine response

- `POST /accounts/:id/signals/:signalId/quarantineResponse` — body `{ status: 'active' | 'block_hidden' | 'block_reject' }`:
  - `active` — approve: find or create arc, deliver signal
  - `block_hidden` — silently discard; sender gets 250 OK but signal is dropped
  - `block_reject` — return SMTP 5xx to sender's mail server ("nuclear unsubscribe")

### Billing / Stripe

- `POST /accounts/:id/billing/checkout-session` — create Stripe Checkout session, return `{ url }` so frontend can redirect
- `GET /accounts/:id/billing` — return current plan/subscription status so BillingView can display it
- `POST /accounts/:id/billing/portal-session` — create Stripe Customer Portal session, return `{ url }` so frontend can redirect (needed for managing subscriptions from BillingView)

---

- [x] Implement Phase 5 — Quarantine view
- [x] Implement Phase 6 — Labels & views
- [x] Implement Phase 7 — Rules engine
- [x] Implement Phase 8 — Search
- [x] Implement Phase 9 — Settings
- [x] Implement Phase 10 — Secondary screens
- [x] Implement Phase 2 — Onboarding flow
- [x] Set up favicon and Open Graph meta tags
- [x] **CSP audit** — add `https://dns.google` to the Content-Security-Policy `connect-src`
      directive (used for client-side DNS verification in the onboarding domain step); also add a
      Playwright test that loads each view and asserts no CSP violations in the console, and that
      all domains referenced in the app's fetch/XHR calls are present in the CSP allowlist

- [x] **Reply composer — wire up draft signal API and complete From field UX**

- [x] **Quarantine view — correct API usage and status handling**
  - The list endpoint (`GET /accounts/:id/signals?status=`) only accepts a single status value per
    call; the quarantine view must make **two parallel requests** — one for `quarantine_visible`
    and one for `quarantine_hidden` — then merge and display all results
  - Display both types in a single list; visually distinguish `quarantine_hidden` items (e.g. a
    muted badge or secondary section) so users understand these were silently held rather than
    actively flagged for review
  - Quarantine response endpoint: `POST /accounts/:id/signals/:id/quarantineResponse`
    - Allow / approve → `{ status: 'active' }` (backend finds or creates an arc and delivers)
    - Block / dismiss → `{ status: 'blocked' }`
  - Update `SignalStatus` in `src/types/server.ts` to include `'quarantine_visible'` and
    `'quarantine_hidden'` (in addition to `'quarantined'` if still used elsewhere)
  - Update `listQuarantinedSignals` in `src/lib/api.ts` to accept the specific status param and
    update the store to issue both calls in parallel and merge results

- [x] **Email templates** — new entity for reusable reply/draft content:
  - Add `EmailTemplate` to `src/types/server.ts`:
    ```ts
    interface EmailTemplate {
      id: string
      accountId: string
      name: string
      subject: string
      body: string
      createdAt: string
      updatedAt: string
    }
    ```
  - Supported interpolation variables: `{{sender.name}}`, `{{sender.address}}`,
    `{{signal.subject}}`, `{{arc.workflow}}`
  - Add API methods to `src/lib/api.ts`:
    `GET /accounts/:id/templates`, `POST`, `PUT /templates/:id`, `DELETE /templates/:id`
  - New `useTemplatesStore` (list, create, update, delete, loading/error state)
  - New route `/templates` — list view showing template name, subject preview, last updated;
    inline or modal editor with name input, subject input, and body textarea; live preview panel
    that resolves interpolation variables against sample values so the user can see the rendered
    output before saving; delete with confirmation warning if the template is referenced by active
    rules
  - Add "Templates" link to the sidebar bottom nav (between Rules and Labels)
  - Template picker in the rule editor for `auto_reply` and `auto_draft` action types
    (searchable dropdown populated from the templates store)

- [x] **Audit log — expandable rows with before/after diff**
  - Update `AuditEvent` in `src/types/server.ts` to match the backend shape:
    replace `metadata?: Record<string, unknown>` with `before?: unknown; after?: unknown`;
    also align field names (`actorId` → `userId`, `createdAt` → `timestamp`,
    `type: AuditEventType` → `action: 'created' | 'updated' | 'deleted' | 'reordered'`,
    `resourceType` narrows to the 8 backend types: `rule | alias | domain | account | label |
view | template | forwarding_address`)
  - Each row in `AuditLogView` becomes expandable (click to toggle); the expanded section renders
    the `before` and `after` snapshots side-by-side as a key-value diff — keys that changed are
    highlighted, added keys shown in green, removed keys in red
  - Only render the expand affordance on rows where `before` or `after` is present (i.e. `updated`
    events); `created` / `deleted` / `reordered` events can show the snapshot in a single column

- [x] **Account switcher** — let users move between accounts they belong to without signing out:
  - Displayed in the sidebar below the brand name: show the current account name with a
    chevron/dropdown indicator; clicking opens an account list popover
  - List all accounts the authenticated user has access to; selecting one reloads the app
    with the new `accountId` (update store, re-fetch all account-scoped data, navigate to `/`)
  - **Backend prerequisite:** no `GET /accounts` (list) endpoint exists — the backend is
    account-scoped and requires a known `:accountId` in every URL. A new endpoint or Authress
    token introspection is needed to enumerate accessible accounts before this can be built.
    Add a corresponding TODO in `rhosys/ses-email-adapter`.

- [x] **Support panel** — persistent help affordance built into the app shell:
  - `?` icon button fixed in the bottom-left corner of the sidebar (always visible, above the
    profile link); opens a slide-over or modal panel without navigating away
  - Panel sections:
    - Knowledge base search — text input that filters a local or fetched article index; results
      show article title + short excerpt; click opens the article inline or in a new tab
    - "Contact support" form — category dropdown, subject, description textarea; on submit
      auto-attaches: account ID, user ID, current route, browser + OS string, and optionally the
      arc/signal ID visible in the current view (read from the route params)
    - Status page link — external link to the service status page
    - Changelog link — links to `/changelog` (future) or external changelog
  - The `?` button badge-dots red when there is an active incident on the status page (optional
    enhancement — poll or use a status API if available)
  - On mobile the button sits in the top header bar rather than the sidebar

- [x] **Rule editor — full redesign** (`RuleEditorView.vue`)

  The current editor has a simple flat AND-only condition list, a single action from 4 options,
  and no JSONLogic serialisation. The backend requires a significant superset of all of this.

  ### Conditions
  - Expand available fields beyond the current 3 (`from.address`, `from.domain`, `subject`) to
    match the backend's full set: `signal.workflow`, `signal.spamScore`, `signal.from.address`,
    `signal.from.domain`, `signal.subject`, `arc.labels`, `arc.status`, `arc.urgency`,
    `signal.workflowData.*` (freeform key path for workflow-specific fields)
  - Add AND/OR group nesting — the current flat list is AND-only; the visual builder needs to
    support nested condition groups so users can express `(A AND B) OR (C AND D)` logic
  - Each condition group renders as an indented card with an AND/OR toggle and add/remove controls
  - The entire condition tree must serialise to a JSONLogic JSON string (`condition: string`) for
    the API, and deserialise back to the visual tree when loading an existing rule
  - Add a JSONLogic client-side evaluator for the rule tester (replace the current manual
    field-by-field evaluation); the test panel should also accept `workflow`, `spamScore`, and
    `arc.urgency` as test inputs to cover the new condition fields

  ### Actions
  - Rules now support **multiple actions** (`actions: RuleAction[]`) — replace the single-select
    action picker with an ordered list of action chips; allow add/remove per action
  - Full set of 14 action types with action-specific inline configuration:
    - `assign_label` — label picker (searchable dropdown from labels store)
    - `assign_workflow` — workflow picker (the 14 workflow enum values)
    - `set_urgency` — urgency picker (`low | normal | high | critical`)
    - `forward` — target forwarding address input (validated email)
    - `auto_reply` — email template picker (from `GET /accounts/:id/templates`)
    - `auto_draft` — email template picker (same)
    - `archive`, `delete`, `block`, `quarantine`, `quarantine_hidden`, `approve_sender`,
      `suppress_notification`, `pong` — no extra config, just the action chip
  - Action chips render in a priority stack; order matters (executed top-to-bottom)

  ### Other editor fields
  - **Enabled / disabled toggle** — maps to `Rule.status: 'enabled' | 'disabled'`; show as a
    labelled toggle in the header area so it's always visible without scrolling
  - **`priorityOrder`** — not editable inline in the editor; controlled via the list view
    (drag-to-reorder or up/down arrows on `RulesView`)

- [x] **Fix `SavedView` position field mismatch** — UI type has `order: number` but backend uses
      `position: number`; the drag-to-reorder in the sidebar is silently sending the wrong field name
      on every PATCH call. Fix: rename `order` → `position` in `SavedView`, `CreateSavedViewBody`,
      `UpdateSavedViewBody`, and `useViewsStore` throughout.

- [x] **Reconcile `Rule` type against backend** — several structural mismatches:
  - `action: RuleAction` (single, UI) → `actions: RuleAction[]` (array, backend)
  - `RuleAction` union (`'allow' | 'block' | 'label' | 'quarantine'`) is stale — backend has 14
    types: `assign_label | assign_workflow | archive | delete | forward | block | quarantine |
quarantine_hidden | set_urgency | suppress_notification | pong | approve_sender | auto_reply |
auto_draft`
  - `conditions: RuleCondition[]` (UI visual builder) → `condition: string` (JSONLogic JSON string,
    backend); the rule editor will need to serialise/deserialise JSONLogic
  - `priorityOrder: number` missing from the UI `Rule` type; add it and expose drag-to-reorder
    (or up/down arrows) in `RulesView` — persist by PATCHing `priorityOrder` on the affected rules

- [x] **Re-check DNS button on domain rows** — Settings → Domains: add a "Re-check" button to
      any domain or DNS record row whose status is not `'verified'` (i.e. `'pending'` or `'failed'`).
  - Calls `PATCH /accounts/:id/domains/:domainId` to trigger an on-demand DNS verification
  - Button is per-domain (not per-record) and only visible when the domain or any of its records
    are non-verified — hide it entirely once all records show `'verified'`
  - Show a spinner in place of the button while the check is in flight; update the record status
    indicators in-place when the response arrives (no full page reload)
  - If the check returns the same non-verified status, leave the button visible so the user can
    retry after fixing their DNS

---

> **Moving to a separate repo:** The marketing site and documentation site will live in their own
> repository. The specs below are preserved here for reference but will not be implemented in this
> repo.

- [ ] ~~Write marketing homepage copy (value prop, screenshots, CTA) — redirect to app if already logged in~~
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

- [ ] ~~**Documentation site** — add a `/docs` section (or subdomain) with:~~
  - Human-readable guides for every feature (rules, quarantine, labels, search, settings, onboarding)
  - **LLM pages:** `/docs/llms.txt` (concise feature index) and `/docs/llms-full.txt` (full
    structured reference). Both must be plain text, no JS, and updated whenever features change.
    These are consumed by AI assistants and search crawlers.
  - OpenAPI / API reference page auto-generated from the backend spec
  - All doc pages must be statically rendered (SSG or SSR), indexable, and JS-free

---

- [x] **Accessibility** — audit the app against WCAG 2.1 AA and fix violations (keyboard nav,
      focus indicators, ARIA labels, colour contrast, screen reader support)


      without redirecting to external documentation:
  - Empty states describe what the feature does and how to get started (not just "nothing here")
  - Tooltip or `<details>` disclosure on every non-obvious control (filter mode options, DNS record
    types, rule operators, quarantine actions, etc.)
  - Onboarding hints that persist until dismissed (not one-shot toasts)
  - No "see docs" or "learn more" links as the primary explanation — docs links are supplementary

- [x] **Responsive design & mobile optimisation** — every screen must work at all viewport sizes:
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

- [x] Add a top of page search bar

- [x] Update authress properties, the appId is `app_2EAWGEdtzaeCj7b45DsDtt`, the app domain is email.rhosys.cloud, and the authress custom domain is login.rhosys.cloud
- [x] **User profile screen** (`/profile`) — personal identity and security settings, fully separate from the account/organisation management screen (`/settings`):
  - **Linked identity connections** — list connected providers (Google, GitHub, etc.) with connected-at date; "Connect" button for unlinked providers; "Disconnect" with confirmation (must keep at least one connection)
  - **Passkey devices** — list enrolled passkeys (device name, registered-at); "Add passkey" flow via `navigator.credentials.create` (WebAuthn); "Remove" per device with confirmation
  - **Active sessions** — table of current sessions (device, browser, IP, last active); "Terminate" per session; "Terminate all other sessions" bulk action
  - This screen is user-scoped (not account/org scoped) — all calls go to the identity provider via `@authress/login` SDK methods, not to the `ses-email-adapter` backend
  - Extend the existing `/profile` view; keep `/settings` strictly org-scoped

- [ ] **AI-powered "code" rule action** — user describes a filter rule in plain English; the browser's built-in LLM (`window.LanguageModel`, Chrome 127+ Gemini Nano) generates a `(signal) => boolean` JS predicate shown for review before saving. Hidden if no browser LLM is available. Requires backend to sandbox and execute the predicate server-side.

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
- **`POST .../quarantineResponse`** — must resolve the signal and return the updated Signal. Must accept all quarantine outcome statuses:
  - `{ status: 'active' }` — approve: find or create arc, deliver signal
  - `{ status: 'block_hidden' }` — accept delivery from sender's server but silently discard the signal; sender receives a successful delivery acknowledgement and is never notified
  - `{ status: 'block_reject' }` — return a permanent delivery failure (e.g. SMTP 5xx) to the sender's mail server; the sending server will notify the sender that the address is unavailable ("nuclear unsubscribe")
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
- **`block_hidden` rule action** — when a rule fires with `action: 'block_hidden'`, the backend must accept delivery from the sender's mail server (so the sender receives a successful 250 OK) and then silently discard the signal without creating an arc or delivering to the user.
- **`block_reject` rule action** — when a rule fires with `action: 'block_reject'`, the backend must return a permanent delivery failure (SMTP 5xx / bounce) to the sender's mail server. The sending server will notify the original sender that the address is permanently unavailable. This is the "nuclear unsubscribe" path — use only when the intent is to signal that the alias no longer accepts mail from this sender.

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

### Backend TODOs — Webhooks

Outbound webhook subscriptions — users configure a URL to receive arc events.

- [ ] `GET /accounts/:id/webhooks` → `{ webhooks: Webhook[] }`
- [ ] `POST /accounts/:id/webhooks` — body `{ url, events: string[], secret? }` → `Webhook` (201)
- [ ] `PATCH /accounts/:id/webhooks/:webhookId` — update url/events/enabled → `Webhook`
- [ ] `DELETE /accounts/:id/webhooks/:webhookId` → 204

```ts
interface Webhook {
  id: string
  accountId: string
  url: string
  events: string[]   // e.g. ['signal:created', 'arc:updated']
  enabled: boolean
  secret?: string    // HMAC signing secret, write-only after creation
  createdAt: string
}
```

### Backend TODOs — API keys

Per-account API keys for direct API scripting. Secret is revealed once on creation, never again.

- [ ] `GET /accounts/:id/api-keys` → `{ apiKeys: ApiKey[] }`
- [ ] `POST /accounts/:id/api-keys` — body `{ name }` → `{ apiKey: ApiKey, secret: string }` (201, secret only in this response)
- [ ] `DELETE /accounts/:id/api-keys/:keyId` → 204

```ts
interface ApiKey {
  id: string
  accountId: string
  name: string
  prefix: string     // first 8 chars of key shown in UI for identification
  createdAt: string
  lastUsedAt?: string
}
```

### Backend TODOs — JMAP support

JMAP (RFC 8620 / RFC 8621) is the modern replacement for IMAP. Implementing it would allow
the frontend to connect to any standards-compliant mail server directly, not just the
SES adapter backend.

- [ ] **JMAP Core** (RFC 8620) — session endpoint, `Core/echo`, capability negotiation
- [ ] **JMAP Mail** (RFC 8621) — `Mailbox/get`, `Email/query`, `Email/get`, `Email/set`,
  `Thread/get`, `EmailSubmission/set` (send), `Mailbox/set` (create/rename/delete folders)
- [ ] **JMAP Push** (RFC 8620 §7) — `EventSource` or WebSocket push channel for live updates,
  replaces the current custom `signal:created` / `arc:updated` WebSocket protocol once JMAP
  is available
- [ ] **Frontend adapter** — once backend exposes JMAP, add `src/lib/jmap.ts` client and
  a feature flag so the app can switch between the current REST API and JMAP without a full
  rewrite; arc/signal store actions become thin wrappers over whichever transport is active

### Backend TODOs — WebSocket realtime events

Frontend schema: `src/types/realtime.ts`. Backend broadcasts on
`wss://…/accounts/:accountId?token=…`. Only two events are needed:

- [ ] **`signal:created`** — broadcast when a new inbound signal is processed and
  attached to an arc. Payload: `{ arcId, signalId, urgency, from: { address, name? }, subject }`.
  The frontend uses `urgency` to decide whether to fire a browser push notification,
  and refreshes the inbox list either way.

- [ ] **`arc:updated`** — broadcast when any arc field changes (status, labels, summary,
  urgency, etc.). Payload: `{ arcId }` only — the client re-fetches the full arc list.
  No browser notification is fired for this event.

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
