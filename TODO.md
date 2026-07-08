# SES Email Adapter UI — Build Plan

## Frontend fields requiring backend support

Fields that the old frontend used but the backend doesn't provide. Removed during the API contract reconciliation (spec: `api-contract-reconciliation`).

### OnboardingState granular progress fields
The frontend onboarding wizard previously tracked step-by-step progress via `domainAdded`, `testEmailReceived`, `senderConfigured`, `notificationCoachCompleted`, and `featureTourCompleted`. The backend only stores `{ completed: boolean; completedAt?: string }`. Either the backend should add granular tracking, or the frontend should persist wizard progress client-side (localStorage).

### TeamMember display fields
The frontend previously rendered `email`, `name`, `status`, `invitedAt`, and `joinedAt` on team members. The backend only returns `{ userId: string; role: UserRole }`. Display information needs to be resolved via Authress user profiles or the backend needs to include these fields.

### Thread grouping and sent-message tracking
- `Thread.groupingKey` — used by the frontend to group threads by sender or subject; not in backend wire shape.
- `Thread.sentMessageIds` — tracked which outbound signals belonged to a thread; not in backend wire shape.
- `Thread.lastUserConfirmedAt` — showed when the user last interacted with a thread; not in backend.
- `Thread.ttl` — time-to-live for auto-deletion; backend uses `retentionDuration` instead.

### RuleAction specific fields
- `RuleAction.labelId` — which label to assign; replaced by generic `value` field.
- `RuleAction.workflow` — which workflow to assign; replaced by generic `value` field.
- `RuleAction.urgency` — urgency level to set; replaced by generic `value` field.
- `RuleAction.forwardTo` — forwarding destination; replaced by generic `value` field.
- `RuleAction.templateId` — template to use for auto-draft/reply; replaced by generic `value` field.

### Domain.status (DnsStatus enum)
The frontend previously had a top-level `status` field on Domain (using a DnsStatus enum). The backend uses boolean flags (`receivingSetupComplete`, `senderSetupComplete`) instead — already migrated.

---

## Unused backend properties requiring UI

Backend fields that exist on the frontend type but aren't yet surfaced in any UI component.

### Composite signal cards
- [ ] Merge linked signals into a single card so the user sees context inline rather than navigating. Affected pairs:
  - `DomainMisconfigurationSignal` ← source email that exposed the misconfiguration
  - `CalendarEventData` ← source email containing the invite
  - `CalendarResponseData` ← original calendar event being responded to
  - `CalendarInviteInvalidData` ← problematic invite email
  - `DeliverabilitySignalData` ← outbound email that bounced

---

## Critical — Remove loading flags from all stores

Every store except `stats.ts` exposes a `loading` ref that fundamentally breaks the reactive model. The store should always return its cached data — the consumer decides if it needs fresher data and calls the fetch action. There is zero reason for a `loading` boolean to exist. It forces every consumer into a three-state (`null | loading | data`) branch that wouldn't exist if the store just returned an empty default until data arrives.

**The rule:** Stores return data. Always. If the cache is empty, they return the empty-shape default. Consumers call `fetchX()` when they mount or detect staleness. The fetch updates the reactive cache; the computed re-evaluates; the UI updates. No flags, no guards, no "is it ready yet" ceremony.

**Stores to fix (remove `loading` ref, adopt stats-store pattern):**

- [ ] `labels.ts` — unconditional `loading = true` on every fetch + artificial 1s delay. Always shows spinner even when cache exists.
- [ ] `rules.ts` — unconditional `loading = true` on every fetch + artificial 1s delay. Same problem.
- [ ] `views.ts` — unconditional `loading = true` on every fetch. Flashes loading state on every navigation to a page that uses views.
- [ ] `templates.ts` — unconditional `loading = true` on every fetch. Same as views.
- [ ] `threads.ts` — partially fixed (only loads when cache is empty), but still exposes `loading` and `loadingMore` flags that consumers branch on.
- [ ] `quarantine.ts` — partially fixed (stale-while-revalidate), but still exposes `loading` and `loadingMore`.
- [ ] `signals.ts` — partially fixed (only loads when thread cache is empty), but still exposes `loading` and `loadingMore`.
- [ ] `drafts.ts` — derived store that still tracks its own `loading` ref for no reason.

**Pattern to follow (`stats.ts`):**
```typescript
const _byAccount = ref<Record<string, T>>({})
const items = computed<T>(() => {
  const id = accountStore.accountId
  return id ? (_byAccount.value[id] ?? EMPTY_DEFAULT) : EMPTY_DEFAULT
})
async function fetchItems() { /* updates _byAccount, no loading flag */ }
```

**Also remove:** the artificial `setTimeout` delays in `labels.ts` and `rules.ts`. These exist to "ensure the skeleton shows long enough" — which is a display-layer concern that doesn't belong in the store. If a skeleton must show for 1s, the *component* can hold a local timer. The store has no business throttling its own responsiveness.

---

## Open tasks

### Adopt cached per-account store pattern everywhere

`src/stores/stats.ts` is the reference implementation: a per-account cache keyed off `accountStore.accountId`, a computed that always returns a populated default (never `null`), and a `fetch*()` that only shows a loading state on the first fetch — revisits show the cached value immediately while refreshing in the background. Several places still fetch directly in the component with a local `ref<T | null>(null)`, which means no cache between mounts and `null`-guards sprinkled through templates. Port these to stores following the same shape:

- [ ] **Identity store** — `loginClient.getUserIdentity()` is called and stored in a local `ref<Identity | null>` independently in `UserAvatar.vue`, `AppNavbar.vue`, and `SettingsView.vue` (three copies of the same `picture`/`displayName`/`userId`/`email` computeds). Extract into `src/stores/identity.ts`.
- [ ] **Billing store** — `BillingView.vue` holds `account`/`billing` as local nullable refs and refetches both (`api.getAccount` + `api.getBilling`) on every mount with no cache; `account` also duplicates data already in `accountStore`. Extract `billing` into a store; drop the redundant `api.getAccount` call in favor of `accountStore.account`.
- [ ] **Audit log store** — `AuditLogView.vue` keeps `events` in a local `ref<AuditEvent[]>([])`, refetching from scratch every visit. Move to a per-account cached store (with cursor/pagination state).
- [ ] **Settings sub-resource stores** — `SettingsView.vue` fetches `aliases`, `domains`, `forwarding`, `team`, and `securityDevices` directly into local refs with no caching layer, unlike `labels`/`threads`/`rules` which already have stores. Extract each into its own store (or one `settings` store with sub-state) so switching tabs doesn't always refetch.

- [ ] **Review feature tour implementation in Kiro** — validate that the tour step targets, spotlight behaviour, and completion/skip persistence work correctly end-to-end.

- [ ] **Deduplicate signals with identical bodies in thread detail view** — when multiple signals on the same thread have identical text bodies (different headers/metadata), collapse them into a single displayed signal with a "received N times" indicator. Compute body fingerprint (SHA-256 of normalized text body) client-side at render time. Show the most recent signal's headers; collapsed duplicates accessible via expand. Edge case: duplicate critical notifications still reach the user via push (backend sends per-signal) — this dedup is display-only, not notification suppression.

### Testing infrastructure

- [ ] **Wire `tests/e2e/*` into CI** — `.github/workflows/build.yml` only runs `vitest` (via `check:ci`) and the `pwa` Playwright project (via `test:pwa`, which targets `tests/pwa-e2e`, a separate directory). The broader Playwright suite in `tests/e2e/` (`layout.responsive.test.ts`, `a11y.test.ts`, `csp.test.ts`, `email-gesture.test.ts`) and the `laptop`/`desktop`/`tablet`/`narrow`/`pixel`/`mobile` projects in `playwright.config.ts` that exercise it are never invoked by CI — `npm run test:e2e` exists as a script but nothing calls it, so regressions there go unnoticed. Add a CI step/job that runs `npm run test:e2e` (or the relevant projects) on PRs. Doing so will surface 6 currently-broken tests in `layout.responsive.test.ts` (sidebar/searchbox/filter-input locators not found on `laptop`) that need to be fixed or explicitly addressed as part of wiring this up.

### Thread & Signal display actions

- [x] **Reply button** — implemented in `ThreadDetailView` and `ThreadRow` (hidden for auth/test/status workflows).
- [x] **Archive button** — implemented in `ThreadDetailView` (with undo toast) and `ThreadRow`.
- [ ] **Attachments display** — render attachment icons and filenames on signal cards. Each attachment should be a clickable link that triggers a download (via presigned S3 URL from `GET /accounts/:accountId/signals/:id/attachments/:key`). Show file type icon, filename, and size. Handle missing/expired presigned URLs gracefully (show "unavailable" state, not a broken link).
- [x] **Delete button** — implemented in ThreadDetailView overflow menu with two-step ConfirmDialog.
- [ ] **Retention badge on ThreadRow** — `ThreadDetailView` already shows "Available until…" inline in the header metadata, but `ThreadRow` (the inbox list) shows nothing. Add a small expiry badge (e.g. "deletes in 3d") to the row when `thread.retentionDuration` is set and the deadline is within 7 days.
- [ ] **Composite signal cards** — `attachLinkedSignals()` wires linked signals to their parent but the cards don't visually merge. Pairs that should render as a single unified card: `domain_misconfiguration` + source email, `calendar_event` + invite email, `calendar_response` + original event, `deliverability` + bounced outbound email. Currently each signal renders as a separate card with a `LinkedSignalSummary` link row; they should collapse into one card showing the primary data with the linked context inline.
- [ ] **Retry Send action on failed signals** — `SystemAlertCard` renders `domain_misconfiguration` and `send_failed` alerts but has no action button. Add a "Retry Send" button that calls the retry endpoint, and surface a warning banner on the Domains settings tab when any domain has an incomplete setup.
- [x] **Remove SchedulingPanel dead stub** — `src/components/panels/SchedulingPanel.vue` is dead code (comment: "backend has no 'scheduling' workflow"). Remove the file and the `v-else-if` branch in `WorkflowPanel.vue`.

### Billing screen

- [ ] **Billing view in Settings** — new route `/settings/billing` displaying all available plans, current subscription status, and upgrade/downgrade actions. Calls `GET /accounts/:id/billing` for current state and `POST .../checkout-session` or `.../portal-session` for Stripe flows.

- [ ] **Real Stripe price IDs in `BillingPanel.vue`** — `starterPriceId`/`proPriceId` are placeholders (`price_TODO_starter`, `price_TODO_pro`). Replace with actual Price IDs from the Stripe dashboard (Products → select product → copy Price ID, format `price_1ABC...`) once the account is set up.

### Extensibility & integrations

- [ ] **Webhooks UI in Settings** — outbound webhook subscriptions so users can pipe thread events into Slack, Discord, or Linear without writing custom code. New tab in the Settings view. Requires backend (see Backend TODOs — Webhooks).

- [ ] **API keys management** — list, create (with one-time secret reveal), and revoke keys. New tab in Settings or Profile. Requires backend (see Backend TODOs — API keys).

---

## V2 — Blocked pending app release

- [ ] **Bundle-size budget in CI** — harden the existing advisory bundle-size check into a hard build failure with defined chunk and total KB limits.

- [ ] **Axe-core — extend to full route list** — extend `tests/e2e/a11y.test.ts` to cover: `/onboarding`, `/invite`, `/billing`, `/profile`, `/rules/new`, `/rules/:id`, `/threads/:id`, `/templates`, `/audit-log`, `/terms`, `/privacy`. Add `wcag21a`, `wcag21aa`, `best-practice` tags.

- [ ] **Test coverage backfill** — the following have no tests at all:
  - Stores: `templates`, `theme`, `account`, `signals`, `views`
  - Views: `SettingsView`, `TemplatesView`, `OnboardingView`, `QuarantineView`, `ThreadDetailView`

---

## Backend routes the frontend calls that must be implemented

These are all `// TODO(backend)` items in `src/lib/api.ts`, consolidated here so they can be ported to `rhosys/ses-email-adapter`.

### Account management

- `POST /accounts` — create a new account (required for self-service onboarding; Step 1 of the onboarding wizard calls this before any domain/alias setup can proceed)
- `GET /accounts` — list all accounts the authenticated user belongs to (needed for account switcher)

### Threads

- `Thread.senderAddress` / `recipientAddress` / `subject` — should be denormalised from the latest inbound signal onto the thread itself so the frontend doesn't have to join against signals. Currently optional on the frontend type pending this backend work (see `src/types/server.ts`).

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
  code: string  // full JS expression: (signal, thread) => string
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

**Endpoints:**
- `GET /accounts/:id/templates` → `{ templates: EmailTemplate[] }`
- `POST /accounts/:id/templates` — body `{ name, subject, body, functions }` → `EmailTemplate` (201)
- `PUT /accounts/:id/templates/:templateId` — full replace → `EmailTemplate`
- `DELETE /accounts/:id/templates/:templateId` → 204

### Quarantine response

- `POST /accounts/:id/signals/:signalId/quarantineResponse` — body `{ status: 'active' | 'block_hidden' | 'block_reject' }`

### Billing / Stripe

- `POST /accounts/:id/billing/checkout-session` — create Stripe Checkout session, return `{ url }`
- `GET /accounts/:id/billing` — return current plan/subscription status
- `POST /accounts/:id/billing/portal-session` — create Stripe Customer Portal session, return `{ url }`

### Webhooks

- `GET /accounts/:id/webhooks` → `{ webhooks: Webhook[] }`
- `POST /accounts/:id/webhooks` — body `{ url, events: string[], secret? }` → `Webhook` (201)
- `PATCH /accounts/:id/webhooks/:webhookId` → `Webhook`
- `DELETE /accounts/:id/webhooks/:webhookId` → 204

### API keys

- `GET /accounts/:id/api-keys` → `{ apiKeys: ApiKey[] }`
- `POST /accounts/:id/api-keys` — body `{ name }` → `{ apiKey: ApiKey, secret: string }` (201)
- `DELETE /accounts/:id/api-keys/:keyId` → 204

### WebSocket realtime events

- `signal:created` — broadcast when a new inbound signal is processed
- `thread:updated` — broadcast when any thread field changes

### Attachments (new — needed for compose image paste)

- `POST /accounts/:id/attachments` — upload file, return `{ url, key, contentType, size }`
- `GET /accounts/:id/attachments/:key` — serve attachment (or presigned redirect)

### Scheduled send (new — needed for compose schedule action)

- `POST /accounts/:id/signals/:signalId/schedule` — body `{ sendAt: string }` (ISO 8601)
- `DELETE /accounts/:id/signals/:signalId/schedule` — cancel scheduled send

### Reminders (new — needed for "Send + Remind Me")

- `POST /accounts/:id/threads/:threadId/reminders` — body `{ remindAt: string }`
- `GET /accounts/:id/reminders` → `{ reminders: Reminder[] }`
- `DELETE /accounts/:id/reminders/:reminderId` → 204

### Support tickets (new — needed for /support page)

- `POST /accounts/:id/support-tickets` — body `{ category: string, subject: string, description: string, context: string }` → `{ ticketId: string }` (201). Receives user-submitted support requests with auto-attached context (account ID, user ID, route, browser). Should store the ticket and notify the support team (email/Slack/etc.).

---

## Reference

> **Moving to a separate repo:** The marketing site and documentation site will live in their own
> repository. The specs below are preserved here for reference but will not be implemented in this
> repo.

- ~~Marketing homepage~~ — separate repo
- ~~Documentation site~~ — separate repo

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

## Conventions

- All views in `src/views/*View.vue`, all reusable pieces in `src/components/`
- Stores own the network calls; views read state and dispatch actions
- `src/lib/api.ts` is the only place `fetch` is called
- All API calls return `Result<T, ApiError>` via neverthrow — stores branch on
  `.isOk()/.isErr()`, no try/catch at the store layer
- New colors and tokens go through the Catppuccin palette — never hard-code
  hex values in components

---

## Session 2026-06-14 — Remaining items

### Refactor

- [x] **Rename Arc → Thread across entire site** — switch all API calls to `/threads/` endpoints, rename `Arc` type to `Thread`, `arcId` to `threadId`, `arcsStore` to `threadsStore`, all component names (`ActiveArcRow` → `ActiveThreadRow`, `ArcDetailView` → `ThreadDetailView`, etc.), route paths (`/arcs/:id` → `/threads/:id`), and file names. Use compiler-driven approach: rename the type first, let `vue-tsc --noEmit` enumerate every broken site, fix all. ~40 files affected.
- [ ] **Apply data-first display pattern to all views** — every component that renders async data must follow: `if (data) → content; else if (loading) → skeleton; else → empty state`. No skeleton when data is already cached. Applies to: list views (inbox, quarantine, drafts, rules, templates, labels, audit, search), detail views (thread detail, quarantine detail), single-resource views (billing, stats), and settings sub-tabs. This eliminates skeleton flashes on navigation, tab switches, and page revisits.
- [ ] **Add retention badge to thread rows** — show "expires in Xd" badge on inbox rows when a thread's retention deadline is within 7 days.

### Bugs

- [x] **Skeleton flash when switching from Inbox to All tab** — fixed: reordered template to show threads first, skeleton only when no data and loading.
- [x] **Stats not counting "allowed" for test workflow emails** — fixed in backend: buildDiffUpdateParams was writing to wrong DynamoDB path.
- [x] **Monthly stats chart not rendering correctly** — fixed: show symbols when ≤3 data points so single-month data is visible.

### Navigation & Layout

- [x] **Delete ProfileView.vue** — the `/profile` route now redirects to `/settings?tab=profile`. The old `ProfileView.vue` file is dead code and should be removed.

### UI Consistency

- [ ] **Audit and unify UI patterns across all views** — Investigate inconsistencies in empty states, section headers, spacing, button variants, text hierarchy (title/description/help-text), and interactive element styling across all screens. Define a shared pattern for: empty states (title + description + CTA), settings sections (label + help text + control), list rows (structure, hover states, action positioning), confirmation flows, and loading skeletons. Document the canonical pattern per element type so new screens match automatically. The Rules empty state inconsistency (fixed separately) is an example of the problem — there are likely more.

### Settings & Configuration

- [ ] **Developer section in Settings** — Webhooks and API Keys will need their own tabs. To avoid tab sprawl, consider grouping them under a "Developer" tab with sub-sections, or a collapsible advanced section.

### Rules

- [x] **Rules tab text contrast** — the empty state description text is small and dim. Review font sizes and contrast against the Templates empty state (which looks correct) and match styling.

### Pending-send state visibility

- [x] **Badge on thread row** — when a thread has a signal in `pending_send` status, show a "Sending…" badge on the thread row in the inbox list.
- [x] **Alert on thread detail** — when viewing a thread that has a `pending_send` signal, show an inline alert banner at the top: "Email sending — cancel available until {undoExpiresAt countdown}".
- [x] **Cancel send button on signal card** — for `pending_send` signals in the signal list, show a "Cancel send" button in the signal card footer (next to the reply button). Clicking it PATCHes the signal back to `draft` status.
- [x] **Admin view signal status** — surface `pending_send` status distinctly in the admin signal list with a cancel action.
- [x] **Persist undoExpiresAt** — computed client-side from sendInitiatedAt + body length (matches backend undo-window.ts). No server-side persistence needed — countdown survives page reloads via signal data already on the signal.


## Merge "New address handling" into "Default filter mode"

- [x] **Rename "Default filter mode" → "New address handling" in the UI** — the account-level `defaultUnknownSenderPolicy` field is what actually controls how new/unknown addresses are treated. The UI currently shows two separate settings: "Default filter mode" (the real enum: allow_all, quarantine_visible, etc.) and "New address handling" (a redundant auto_allow/block_until_approved toggle). Merge them: remove the separate "New address handling" toggle entirely, rename the "Default filter mode" setting to use the title and help text that currently belongs to "New address handling" (since that copy better explains the user intent), but keep the underlying API property as `defaultUnknownSenderPolicy` with its full enum of values. The result: one setting, named "New address handling", backed by `defaultUnknownSenderPolicy`, with all six policy values available.
