# SES Email Adapter UI — Build Plan

## Frontend fields requiring backend support

Fields that the old frontend used but the backend doesn't provide. Removed during the API contract reconciliation (spec: `api-contract-reconciliation`).

### OnboardingState granular progress fields
The frontend onboarding wizard previously tracked step-by-step progress via `domainAdded`, `testEmailReceived`, `senderConfigured`, `notificationCoachCompleted`, and `featureTourCompleted`. The backend only stores `{ completed: boolean; completedAt?: string }`. Either the backend should add granular tracking, or the frontend should persist wizard progress client-side (localStorage).

### TeamMember display fields
The frontend previously rendered `email`, `name`, `status`, `invitedAt`, and `joinedAt` on team members. The backend only returns `{ userId: string; role: UserRole }`. Display information needs to be resolved via Authress user profiles or the backend needs to include these fields.

### Arc grouping and sent-message tracking
- `Arc.groupingKey` — used by the frontend to group arcs by sender/thread; not in backend wire shape.
- `Arc.sentMessageIds` — tracked which outbound signals belonged to an arc; not in backend wire shape.
- `Arc.lastUserConfirmedAt` — showed when the user last interacted with an arc; not in backend.
- `Arc.ttl` — time-to-live for auto-deletion; backend uses `retentionDuration` instead.

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

### View
- [ ] `View.layout` — custom component layout array. Deferred to the modular component system V2 (layout editor).

### Composite signal cards
- [ ] Merge linked signals into a single card so the user sees context inline rather than navigating. Affected pairs:
  - `DomainMisconfigurationSignal` ← source email that exposed the misconfiguration
  - `CalendarEventData` ← source email containing the invite
  - `CalendarResponseData` ← original calendar event being responded to
  - `CalendarInviteInvalidData` ← problematic invite email
  - `DeliverabilitySignalData` ← outbound email that bounced

---

## Open tasks

- [ ] **Unsubscribe UI** — the backend now exposes `signal.data.unsubscribe: { type: "server" | "website" | "mailto", url: string }` on inbound email signals (extracted from `List-Unsubscribe` / `List-Unsubscribe-Post` headers). The UI needs:
  - An unsubscribe button/action on arc rows and arc detail for signals where `unsubscribe` is present.
  - If `type === "server"`: call `POST /accounts/:id/arcs/:arcId/unsubscribe` — backend fires RFC 8058 one-click POST. Show success/failure toast.
  - If `type === "website"`: open the URL in a new browser tab (user must complete on the sender's site).
  - If `type === "mailto"`: show a disabled/coming-soon state or hide — backend returns 202 pending.
  - The old `workflowData.unsubscribeUrl` field on `ContentData` has been removed — the mock data already uses the new `unsubscribe` property on signal data.

- [ ] **Review feature tour implementation in Kiro** — validate that the tour step targets, spotlight behaviour, and completion/skip persistence work correctly end-to-end.

- [ ] **Deduplicate signals with identical bodies in arc detail view** — when multiple signals on the same arc have identical text bodies (different headers/metadata), collapse them into a single displayed signal with a "received N times" indicator. Compute body fingerprint (SHA-256 of normalized text body) client-side at render time. Show the most recent signal's headers; collapsed duplicates accessible via expand. Edge case: duplicate critical notifications still reach the user via push (backend sends per-signal) — this dedup is display-only, not notification suppression.

### Arc & Signal display actions

- [x] **Reply button** — implemented in `ArcDetailView` and `ArcRow` (hidden for auth/test/status workflows).
- [x] **Archive button** — implemented in `ArcDetailView` (with undo toast) and `ArcRow`.
- [ ] **Delete button** — no delete action exists anywhere in the UI. Needs a `ConfirmDialog` ("this is irreversible"), then `DELETE /arcs/:id`. Show in `ArcDetailView` action bar and `ArcRow` overflow menu. Only show for arcs that are already archived or have `status === 'deleted'` to avoid accidental hard deletes.
- [ ] **Retention badge on ArcRow** — `ArcDetailView` already shows "Available until…" inline in the header metadata, but `ArcRow` (the inbox list) shows nothing. Add a small expiry badge (e.g. "expires in 3d") to the row when `arc.retentionDuration` is set and the deadline is within 7 days.
- [ ] **Composite signal cards** — `attachLinkedSignals()` wires linked signals to their parent but the cards don't visually merge. Pairs that should render as a single unified card: `domain_misconfiguration` + source email, `calendar_event` + invite email, `calendar_response` + original event, `deliverability` + bounced outbound email. Currently each signal renders as a separate card with a `LinkedSignalSummary` link row; they should collapse into one card showing the primary data with the linked context inline.
- [ ] **Retry Send action on failed signals** — `SystemAlertCard` renders `domain_misconfiguration` and `send_failed` alerts but has no action button. Add a "Retry Send" button that calls the retry endpoint, and surface a warning banner on the Domains settings tab when any domain has an incomplete setup.
- [ ] **Remove SchedulingPanel dead stub** — `src/components/panels/SchedulingPanel.vue` is dead code (comment: "backend has no 'scheduling' workflow"). Remove the file and the `v-else-if` branch in `WorkflowPanel.vue`.

### Billing screen

- [ ] **Billing view in Settings** — new route `/settings/billing` displaying all available plans, current subscription status, and upgrade/downgrade actions. Calls `GET /accounts/:id/billing` for current state and `POST .../checkout-session` or `.../portal-session` for Stripe flows.

### Extensibility & integrations

- [ ] **Webhooks UI in Settings** — outbound webhook subscriptions so users can pipe arc events into Slack, Discord, or Linear without writing custom code. New tab in the Settings view. Requires backend (see Backend TODOs — Webhooks).

- [ ] **API keys management** — list, create (with one-time secret reveal), and revoke keys. New tab in Settings or Profile. Requires backend (see Backend TODOs — API keys).

- [ ] **AI-powered "code" rule action** — user describes a filter rule in plain English; the browser's built-in LLM (`window.LanguageModel`, Chrome 127+ Gemini Nano) generates a `(signal) => boolean` JS predicate shown for review before saving. Hidden if no browser LLM is available. Requires backend to sandbox and execute the predicate server-side.

---

## V2 — Blocked pending app release

- [ ] **Bundle-size budget in CI** — harden the existing advisory bundle-size check into a hard build failure with defined chunk and total KB limits.

- [ ] **Axe-core — extend to full route list** — extend `tests/e2e/a11y.test.ts` to cover: `/onboarding`, `/invite`, `/billing`, `/profile`, `/rules/new`, `/rules/:id`, `/arcs/:id`, `/templates`, `/audit-log`, `/terms`, `/privacy`. Add `wcag21a`, `wcag21aa`, `best-practice` tags.

- [ ] **Test coverage backfill** — the following have no tests at all:
  - Stores: `templates`, `theme`, `account`, `signals`, `views`
  - Views: `SettingsView`, `TemplatesView`, `OnboardingView`, `QuarantineView`, `ArcDetailView`

- [ ] **Modular component system + LLM-composable layouts** — decompose every view into a registry of self-describing, slot-composable components so that an LLM can produce a valid layout tree for any view and users can save a custom layout per view.

---

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
- `arc:updated` — broadcast when any arc field changes

### Attachments (new — needed for compose image paste)

- `POST /accounts/:id/attachments` — upload file, return `{ url, key, contentType, size }`
- `GET /accounts/:id/attachments/:key` — serve attachment (or presigned redirect)

### Scheduled send (new — needed for compose schedule action)

- `POST /accounts/:id/signals/:signalId/schedule` — body `{ sendAt: string }` (ISO 8601)
- `DELETE /accounts/:id/signals/:signalId/schedule` — cancel scheduled send

### Reminders (new — needed for "Send + Remind Me")

- `POST /accounts/:id/arcs/:arcId/reminders` — body `{ remindAt: string }`
- `GET /accounts/:id/reminders` → `{ reminders: Reminder[] }`
- `DELETE /accounts/:id/reminders/:reminderId` → 204

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

### Navigation & Layout

- [ ] **Tour button in navbar** — small icon button (compass or `?`) next to user avatar that triggers the guided tour on demand. Always visible, no conditional logic.
- [ ] **Tour button in changelog popout** — "Take the tour" link/button in the ChangelogView so users can discover it naturally.
- [ ] **Tab switching causes full page reload** — `accountStore.switchAccount()` uses `window.location.assign('/')` which hard-reloads the page. Investigate whether any Settings tab-switch path inadvertently triggers this. The account switcher is now in the sidebar — confirm it doesn't fire on non-switcher interactions.
- [ ] **Delete ProfileView.vue** — the `/profile` route now redirects to `/settings?tab=profile`. The old `ProfileView.vue` file is dead code and should be removed.

### Settings & Configuration

- [ ] **Compose tab: surface inbox behavior settings** — the Compose tab only has "After Send". Consider adding `retentionDuration` (how long arcs are kept before deletion), `filtering.newAddressHandling` (what happens when mail hits a never-seen-before alias), and account-level `filtering.spamScoreThreshold` (default for all aliases). These may warrant a separate "Inbox Behavior" sub-section within Compose or a dedicated tab.
- [ ] **Developer section in Settings** — Webhooks and API Keys will need their own tabs. To avoid tab sprawl, consider grouping them under a "Developer" tab with sub-sections, or a collapsible advanced section.

### Rules

- [ ] **Rules tab text contrast** — the empty state description text is small and dim. Review font sizes and contrast against the Templates empty state (which looks correct) and match styling.
