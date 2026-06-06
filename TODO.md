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

### Arc
- [ ] `Arc.retentionDuration` — per-arc retention override. Could show a retention badge on arcs with non-default policy.

### View
- [ ] `View.layout` — custom component layout array. Deferred to the modular component system V2 (layout editor).

### Signal (DomainMisconfiguration)
- [ ] `DomainMisconfigurationSignal.data.linkedSignalId` — reference to the triggering signal. Could link to the original email that exposed the misconfiguration.

### Signal (Calendar)
- [ ] `CalendarEventData.linkedSignalId` — reference to the email that contained the invite. Could link back to the original email.
- [ ] `CalendarResponseData.linkedSignalId` — reference to the original calendar event. Could link to the event being responded to.
- [ ] `CalendarInviteInvalidData.linkedSignalId` — reference to the invalid invite email. Could link to the problematic signal.

### Signal (System alerts)
- [ ] `DeliverabilitySignalData.linkedSignalId` — could link to the original outbound email that bounced.

---

## Open tasks

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
