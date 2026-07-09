# SES Email Adapter UI — Build Plan

> **Priority order:** within a section, and across sections, items are listed top-to-bottom in priority order. Work the first unchecked item before later ones unless told otherwise.

## Next up

- [ ] **Identity store** — `loginClient.getUserIdentity()` is called and stored in a local `ref<Identity | null>` independently in `UserAvatar.vue`, `AppNavbar.vue`, and `SettingsView.vue` (three copies of the same `picture`/`displayName`/`userId`/`email` computeds). Extract into `src/stores/identity.ts`, following the same per-account cached-store pattern as `stats.ts` (see "Adopt cached per-account store pattern everywhere" below).

---

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

- [ ] **Billing store** — `BillingView.vue` holds `account`/`billing` as local nullable refs and refetches both (`api.getAccount` + `api.getBilling`) on every mount with no cache; `account` also duplicates data already in `accountStore`. Extract `billing` into a store; drop the redundant `api.getAccount` call in favor of `accountStore.account`.
- [ ] **Settings sub-resource stores** — `SettingsView.vue` fetches `aliases`, `domains`, `forwarding`, `team`, and `securityDevices` directly into local refs with no caching layer, unlike `labels`/`threads`/`rules` which already have stores. Extract each into its own store (or one `settings` store with sub-state) so switching tabs doesn't always refetch.

- [ ] **Review feature tour implementation in Kiro** — validate that the tour step targets, spotlight behaviour, and completion/skip persistence work correctly end-to-end.

- [ ] **Deduplicate signals with identical bodies in thread detail view** — when multiple signals on the same thread have identical text bodies (different headers/metadata), collapse them into a single displayed signal with a "received N times" indicator. Compute body fingerprint (SHA-256 of normalized text body) client-side at render time. Show the most recent signal's headers; collapsed duplicates accessible via expand. Edge case: duplicate critical notifications still reach the user via push (backend sends per-signal) — this dedup is display-only, not notification suppression.

### Testing infrastructure

- [ ] **Wire `tests/e2e/*` into CI** — `.github/workflows/build.yml` only runs `vitest` (via `check:ci`) and the `pwa` Playwright project (via `test:pwa`, which targets `tests/pwa-e2e`, a separate directory). The broader Playwright suite in `tests/e2e/` (`layout.responsive.test.ts`, `a11y.test.ts`, `csp.test.ts`, `email-gesture.test.ts`) and the `laptop`/`desktop`/`tablet`/`narrow`/`pixel`/`mobile` projects in `playwright.config.ts` that exercise it are never invoked by CI — `npm run test:e2e` exists as a script but nothing calls it, so regressions there go unnoticed. Add a CI step/job that runs `npm run test:e2e` (or the relevant projects) on PRs. Doing so will surface 6 currently-broken tests in `layout.responsive.test.ts` (sidebar/searchbox/filter-input locators not found on `laptop`) that need to be fixed or explicitly addressed as part of wiring this up.

### Thread & Signal display actions

- [ ] **Retention badge on ThreadRow** — `ThreadDetailView` already shows "Available until…" inline in the header metadata, but `ThreadRow` (the inbox list) shows nothing. Add a small expiry badge (e.g. "deletes in 3d") to the row when `thread.retentionDuration` is set and the deadline is within 7 days.
- [ ] **Composite signal cards** — `attachLinkedSignals()` wires linked signals to their parent but the cards don't visually merge. Pairs that should render as a single unified card: `domain_misconfiguration` + source email, `calendar_event` + invite email, `calendar_response` + original event, `deliverability` + bounced outbound email. Currently each signal renders as a separate card with a `LinkedSignalSummary` link row; they should collapse into one card showing the primary data with the linked context inline.
- [ ] **Retry Send action on failed signals** — `SystemAlertCard` renders `domain_misconfiguration` and `send_failed` alerts but has no action button. Add a "Retry Send" button that calls the retry endpoint, and surface a warning banner on the Domains settings tab when any domain has an incomplete setup.

### Billing screen

- [ ] **Billing view in Settings** — new route `/settings/billing` displaying all available plans, current subscription status, and upgrade/downgrade actions. Calls `GET /accounts/:id/billing` for current state and `POST .../checkout-session` or `.../portal-session` for Stripe flows.

- [ ] **Real Stripe price IDs in `BillingPanel.vue`** — `starterPriceId`/`proPriceId` are placeholders (`price_TODO_starter`, `price_TODO_pro`). Replace with actual Price IDs from the Stripe dashboard (Products → select product → copy Price ID, format `price_1ABC...`) once the account is set up.

### Extensibility & integrations

- [ ] **Webhooks UI in Settings** — outbound webhook subscriptions so users can pipe thread events into Slack, Discord, or Linear without writing custom code. New tab in the Settings view. Requires backend (see Backend TODOs — Webhooks).

---

## V2 — Blocked pending app release

- [ ] **Bundle-size budget in CI** — harden the existing advisory bundle-size check into a hard build failure with defined chunk and total KB limits.

- [ ] **Axe-core — extend to full route list** — extend `tests/e2e/a11y.test.ts` to cover: `/onboarding`, `/invite`, `/billing`, `/profile`, `/rules/new`, `/rules/:id`, `/threads/:id`, `/templates`, `/audit-log`, `/terms`, `/privacy`. Add `wcag21a`, `wcag21aa`, `best-practice` tags.

- [ ] **Test coverage backfill** — the following have no tests at all:
  - Stores: `templates`, `theme`, `account`, `signals`, `views`
  - Views: `SettingsView`, `TemplatesView`, `OnboardingView`, `QuarantineView`, `ThreadDetailView`

---

## Backend routes the frontend calls that must be implemented

Backend routes the frontend already calls (or is already coded to call) that don't exist yet, consolidated here so they can be ported to `rhosys/ses-email-adapter`. (Account management, Threads denormalization, Labels, Saved views, Rules, Domains, Team members, Audit log, Email templates, and Quarantine response were all in this list previously — verified against the backend's OpenAPI spec and removed as already implemented.)

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

- [ ] **Apply data-first display pattern to all views** — every component that renders async data must follow: `if (data) → content; else if (loading) → skeleton; else → empty state`. No skeleton when data is already cached. Applies to: list views (inbox, quarantine, drafts, rules, templates, labels, audit, search), detail views (thread detail, quarantine detail), single-resource views (billing, stats), and settings sub-tabs. This eliminates skeleton flashes on navigation, tab switches, and page revisits.
- [ ] **Add retention badge to thread rows** — show "expires in Xd" badge on inbox rows when a thread's retention deadline is within 7 days.

### UI Consistency

- [ ] **Audit and unify UI patterns across all views** — Investigate inconsistencies in empty states, section headers, spacing, button variants, text hierarchy (title/description/help-text), and interactive element styling across all screens. Define a shared pattern for: empty states (title + description + CTA), settings sections (label + help text + control), list rows (structure, hover states, action positioning), confirmation flows, and loading skeletons. Document the canonical pattern per element type so new screens match automatically. The Rules empty state inconsistency (fixed separately) is an example of the problem — there are likely more.

### Settings & Configuration

- [ ] **Developer section in Settings** — Webhooks will need its own tab. Consider a "Developer" tab (or a collapsible advanced section) rather than adding it directly to the top-level tab bar, so it's easy to fold in related tooling later without more tab sprawl.
