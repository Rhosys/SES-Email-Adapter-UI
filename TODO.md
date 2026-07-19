# SES Email Adapter UI — Build Plan

> **Priority order:** within a section, and across sections, items are listed top-to-bottom in priority order. Work the first unchecked item before later ones unless told otherwise.

## Next up

- [x] **Identity store** — `loginClient.getUserIdentity()` was called and stored in a local `ref<Identity | null>` independently in 6 places (`UserAvatar.vue`, `AppNavbar.vue`, `AppSidebar.vue`, `SettingsView.vue`, `main.ts` ×2, `SupportView.vue`). Not a Pinia store — it's a synchronous, purely-derived SDK read with no server round-trip, so a shared `src/composables/useIdentity.ts` (not global app state) is the right layer. Also extracted `src/components/UserAvatarIcon.vue` for the picture-or-initials circle markup, which was separately duplicated 6 times across the same call sites.

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

### UI Consistency

- [ ] **Audit and unify UI patterns across all views** — Investigate inconsistencies in empty states, section headers, spacing, button variants, text hierarchy (title/description/help-text), and interactive element styling across all screens. Define a shared pattern for: empty states (title + description + CTA), settings sections (label + help text + control), list rows (structure, hover states, action positioning), confirmation flows, and loading skeletons. Document the canonical pattern per element type so new screens match automatically. The Rules empty state inconsistency (fixed separately) is an example of the problem — there are likely more.

---

## Session 2026-07-14 — Mobile UI + notifications review

> Review pass (mostly mobile / installed PWA). Each item below is being reviewed
> and de-risked **before** implementation. `❓` marks an open question/unknown to
> resolve during review; `🔎` marks a review finding. We iterate one item at a
> time — resolve the unknowns, agree the approach, then implement.

- [~] **1. Inbox/Archived/All bottom icon buttons (mobile)** — make the three
  status tabs easier to switch between on mobile via a bottom icon bar.
  **DONE (pending visual sign-off):** renamed `StatusTabs.vue`→`InboxTabBar.vue`
  (desktop strip `hidden sm:flex` + mobile `fixed bottom-0 sm:hidden` icon bar,
  tray/archive-box/layers icons, mauve active, green active-count badge on Inbox
  via props); extracted `src/lib/badge.ts` (`formatBadgeCount`, now shared with
  `AppSidebar`); `InboxView` passes counts + `pb-24 sm:pb-4` to clear the bar;
  renamed test → `InboxTabBar.test.ts` (7 tests). ✅ typecheck + eslint clean,
  ✅ 7/7 tests pass. ⏳ mobile/desktop screenshot capture.
  - 🔎 Mount: `AppLayout` `#main-content` is `flex-1 overflow-y-auto`; each view
    renders inside. Simplest: render the mobile bar INSIDE `InboxView` (its
    `.inbox-view` root), `sm:hidden fixed bottom-0 inset-x-0`, styled like
    `SettingsTabBar.vue` (icon over tiny label, `pb-[env(safe-area-inset-bottom)]`,
    active = `text-ctp-mauve`), and add matching bottom padding to the inbox
    `<main>` so the last row clears it. Keep the desktop top `StatusTabs` strip.
  - 🔎 Coexist: the bar shows only on `/` (inbox); the mobile sidebar profile row
    lives inside the off-canvas sidebar, so no overlap.
  - ✅ **Decided:** extend the existing component but **rename `StatusTabs.vue` →
    `InboxTabBar.vue`** (it now owns both layouts + is inbox-specific). Update the
    import in `InboxView.vue`, and rename `tests/component/StatusTabs.test.ts` →
    `InboxTabBar.test.ts`.
  - ✅ **Decided:** on mobile the bottom bar REPLACES the top strip (top strip
    `hidden sm:flex`); tabs are **icon + tiny label**; **active-count badge on the
    Inbox tab**.
  - 🔎 Test impact: one component rendering desktop strip + mobile bar = 6
    `<button>`s → existing `findAll('button')===3` assertion must be scoped
    per-region; add a badge test.
  - ❓ Remaining (proceeding with recommended default unless told otherwise):
    (a) badge data via **props** from InboxView [rec] vs store import — props keep
    the component Pinia-free/testable; extract `formatBadgeCount` (today private in
    `AppSidebar.vue:31`) into a shared helper; (b) icons **tray / archive-box /
    layers** [rec]; (c) active color on mobile bar **mauve** (match
    `SettingsTabBar`) [rec], desktop keeps its blue underline.

- [ ] **2. Sidebar growth separator (Settings + Admin pinned to bottom)** —
  `AppSidebar.vue`.
  - ✅ **DECIDED (superseding the mt-auto-inside-nav idea above — that only pins
    when content is short; doesn't survive a long Views/Labels list):** move
    Settings + Admin OUT of the scrollable `<nav>` entirely into a new sibling
    `<nav aria-label="Account">` block, placed after `</nav>` and before the
    mobile-profile-row / account-switcher divs. Label the existing primary nav
    `aria-label="Primary"` for symmetry. No `mt-auto` needed anywhere — `<nav
    class="flex-1 overflow-y-auto">` already consumes all leftover vertical
    space in the `aside`'s flex column, so any sibling placed after it (exactly
    like the existing pinned mobile-profile-row / account-switcher blocks today)
    lands at the true bottom of the sidebar regardless of how long the
    scrollable content above grows — mirrors the existing precedent instead of
    inventing a new mechanism.
  - ✅ Scope: ONLY Settings + Admin move. Rules/Templates/Labels(+label list)
    stay in the primary nav, below the existing separator at line 194 — no
    change to that group.
  - ✅ Always-visible `border-t` at the top of the new block (the "growth
    separator" — visible whether the gap above it is empty or the list above
    butts right up against it).
  - ✅ Add a structural regression test to `tests/component/AppSidebar.test.ts`:
    assert the Settings/Admin links' nearest `nav` ancestor is NOT the same
    element as the primary/scrollable nav — locks in "never scrolls away."
  - 🔎 Verification plan: `tests/e2e/a11y.test.ts` runs real axe-core
    (wcag2a/wcag2aa) against `/` and `/settings` forcing `browserName:'chromium'`
    — the one browser actually installed here — so it can be run for real
    post-implementation, not just asserted. `landmark-unique` is an axe
    best-practice rule (not wcag2a/aa-tagged), so it wouldn't itself fail on an
    unlabeled second `<nav>`, but we're labeling both anyway for real
    screen-reader users.

- [x] **3. Mobile Settings header: hide hamburger + show "{tab}" title** —
  `AppLayout.vue` / `AppNavbar.vue` / `SettingsView.vue`. **DONE.**
  Decisions: (a) `AppNavbar` gets a `mobileBack?: boolean` prop + `back` emit
  (props, no slot — it has exactly one call site, so slot indirection bought
  nothing); when true it renders a "‹ Back" text button in place of the
  hamburger (`v-else-if`, so the hamburger is truly absent, not just
  CSS-hidden). (b) Back navigates via `router.back()`, falling back to
  `router.push('/')` when `window.history.state?.back` is empty (deep-link/no
  prior in-app history). (c) SettingsView's own mobile "← Back to app" bar
  (old `SettingsView.vue:792-805`) removed entirely — one bar only. (d) Layout:
  back button with "Back" text label on the left, "{Tab}" title as separate
  text in the middle (replacing the mobile search facade only — desktop search
  is untouched on `/settings`, confirmed by screenshot). Extracted
  `src/lib/settingsTabs.ts` (`SETTINGS_TABS`, `resolveSettingsTab`,
  `settingsTabLabel`) as the single source of truth for tab labels/legacy-key
  mapping, used by both `SettingsView` and `AppLayout`.
  Verification: ✅ typecheck/eslint clean, ✅ 329/329 unit tests (10 new: 6 for
  `settingsTabs` helpers, 4 for `AppNavbar`'s back/hamburger swap), ✅ real
  axe-core WCAG2A/AA audit on mobile `/settings` — 0 violations, ✅ screenshots
  confirm: mobile shows one bar ("‹ Back" + "Profile"/"Team", updates live with
  tab switches, hamburger genuinely absent from the DOM); desktop `/settings`
  fully unchanged (search bar present, back button present-but-CSS-hidden same
  as hamburger's existing convention); real back-button click exercised via
  history (`/` → `/settings` → click Back → lands on `/`).
  - 🔎 On mobile Settings there are currently TWO stacked bars: the global
    `AppNavbar` (hamburger + search facade) AND SettingsView's own mobile bar
    ("← Back to app", `SettingsView.vue:794`). Replacing the search with a title
    without removing one of these leaves two bars. → **Decision:** merge — put
    the "{tab}" title (and optionally the back affordance) into the global
    AppNavbar on mobile Settings, and drop SettingsView's separate top bar; the
    bottom `SettingsTabBar` already shows the section.
  - 🔎 Route title map exists (`router/index.ts:158 ROUTE_TITLES`) but only has
    route-level "Settings" — the sub-tab labels live in `SettingsView.TABS`
    (+ `LEGACY_TAB_MAP`). AppLayout must derive the tab label from
    `route.query.tab`; share the TABS label map (export it) rather than
    duplicating.

- [x] **4. Hide keyboard-shortcuts UI on mobile** — **DONE.** Decisions: (a) hide
  the WHOLE section (heading + description + button), not just the button.
  (b) Implemented as a reactive `v-if` (new `src/composables/useIsMobile.ts`,
  a matchMedia-based `ref<boolean>`, same pattern `OverflowMenu.vue` already
  used inline — extracted since this is now the second use site) rather than a
  CSS `hidden sm:block`, so the section's own (pre-existing, redundant)
  `ShortcutHelpOverlay` instance doesn't even mount on mobile. (c) The global
  `?` binding wasn't just hidden from Settings — the ENTIRE shortcut system
  (all bindings: navigate, archive, go-to sequences, everything) is now a
  no-op below the 640px breakpoint, gated with a single live
  `window.innerWidth < 640` check at the top of `handleKeydown`
  (`useKeyboardShortcuts.ts`) — checked fresh per keydown (not cached), so it
  tracks resize/rotation like `AppLayout`'s existing swipe-gesture check.
  Rationale: leaving other bindings live-but-undiscoverable (no `?` to look
  them up, no Settings entry point) on a Bluetooth-keyboard mobile session
  would be worse than the status quo. (d) Left the pre-existing duplicate
  `ShortcutHelpOverlay` mount (SettingsView has its own private instance
  alongside AppLayout's global one) untouched — out of scope for this task,
  noted here for a future cleanup pass.
  Verification: ✅ typecheck/eslint clean, ✅ 336/336 unit tests (7 new: 4 for
  `useIsMobile` incl. matchMedia-unavailable fallback, 3 for
  `useKeyboardShortcuts`'s mobile gate incl. live re-check on resize).
  ✅ Screenshots confirm section fully absent on mobile, unchanged on desktop.
  ✅ Real browser check (direct `KeyboardEvent` dispatch, not synthesized
  OS-level key presses which proved unreliable for `?`): on mobile, `/`
  (search focus), `g→i` (go to inbox), and `?` (help overlay) are ALL
  confirmed no-ops; on desktop, all three still work correctly.

- [x] **5. Start tour on mobile opens the sidebar first** — **DONE.**
  Root cause confirmed: tour spotlights `data-tour="nav-*"` items that live in
  the off-canvas sidebar (`-translate-x-full` on mobile) — `updateSpotlight()`
  measured the hidden/off-screen element.
  - ✅ **3 entry points, all fixed** (not just the Settings button):
    `SettingsView`'s "Start tour" button, `OnboardingCoach.vue`'s tour button
    (both already inside `AppLayout` when clicked — clean `watch(tourActive)`
    fix), AND `OnboardingView.vue`'s auto-start-on-completion, which calls
    `startTour()` on `/onboarding` — a top-level route rendered OUTSIDE
    `AppLayout`/`FeatureTour` — so `tourActive` is already `true` by the time
    `FeatureTour` later mounts (after redirecting into the app), and a plain
    `watch()` never fires for a value that was already set before the watcher
    existed. Fixed in both places with an explicit "catch-up" `onMounted`
    check (not `{immediate:true}`, since that fires during `setup()` — too
    early for `useIsMobile()`'s own `onMounted`, which syncs the real
    viewport, to have run yet; used registration-order sequencing instead —
    call `useIsMobile()` before registering the catch-up `onMounted`, so Vue's
    same-instance `onMounted` ordering guarantees it runs first).
  - ✅ Sidebar auto-open: `AppLayout.vue` — `watch(tourActive, ...)` +
    mount-time catch-up call `openSidebarForMobileTour()`, gated on the new
    `useIsMobile()` composable (reused from item #4).
  - ✅ Spotlight timing: `FeatureTour.vue` — `waitForSidebarSettle(el)` attaches
    a one-shot `transitionend` (property `transform`) listener on the target's
    closest `<aside>`, with a 300ms fallback timeout for the case nothing is
    actually transitioning (sidebar already open, or desktop). Only invoked
    when `isMobile.value` — desktop pays zero extra delay, exactly as before.
  - ✅ Tooltip repositioning: extracted a pure `src/lib/tooltipPosition.ts`
    (`computeTooltipPosition`) that tries right → left → below → above based
    on actual measured card size + available viewport space, clamped to never
    run off-screen; falls back to centered if nothing fits. `FeatureTour.vue`
    measures the real tooltip element (`tooltipEl` ref) rather than assuming a
    fixed height.
  Verification: ✅ typecheck/eslint clean, ✅ 347/347 unit tests (7 new for
  `computeTooltipPosition` incl. all 4 fallback directions + edge clamping, 4
  new component tests for `FeatureTour` incl. the already-active-before-mount
  regression guard). ✅ Real browser (built app, real CSS transitions, real
  `getBoundingClientRect()`): mobile — sidebar opens, both spotlight AND
  tooltip land 100% on-screen at step 1 (tooltip re-anchored below since no
  room to the right on 390px) and step 2; desktop — pixel-identical to before
  (tooltip right of spotlight, no added delay). Screenshots confirm visually.

- [x] **6. Calendar/digest "Add new…" → forwarding add modal** — **DONE.**
  Decisions: (a) auto-select the new target ONLY when verified (webhooks are
  created verified immediately, per backend `aliasesApi.ts:306-315`); for
  email targets (stay `pending` until the user clicks the verification link)
  show a toast instead ("check your inbox, then select it here") and leave
  the select as it was. (b) The existing "Add Forwarding Target" button on
  the Email & Forwarding tab was migrated to the SAME new modal too — one
  flow everywhere, its old inline expanding form deleted entirely, not kept
  as a second UI. (c) The select stays showing "＋ Add new…" while the modal
  is open (not reverted immediately), only reverting to the previous value on
  cancel or once the create resolves — implemented via a computed
  get/set (`calendarSelectValue`/`digestSelectValue`) wrapping a
  `*ShowingSentinel` boolean flag, rather than a second mirrored ref, so the
  sentinel string never leaks into the persisted
  `calendarForwardingTargetId`/`digestForwardingTargetId` values.
  New `src/components/settings/AddForwardingTargetModal.vue` — not
  Teleported (matches `FilterModeModal.vue`/`ConfirmDialog.vue`, the two
  OTHER modals already used in this same file), takes a `submit` function
  prop (not an emit) so `AsyncButton` keeps owning its own pending state, per
  this codebase's existing convention. Selecting "＋ Add new…" from EITHER
  select calls `switchTab('email-forwarding')` (no-op from the calendar
  select, real from the digest select which lives on the Profile tab) before
  opening the modal, so the newly-created row/pending-target context is
  visible once it closes.
  - 🔎 **Real bug found and fixed along the way:** the outer backdrop `<div>`
    had `aria-hidden="true"` (copied from `FilterModeModal.vue`'s existing
    pattern) wrapping the `role="dialog"` content — per the ARIA spec this
    hides the ENTIRE subtree, including the dialog, from the accessibility
    tree and from role-based queries (caught this because Playwright's
    `getByRole('dialog')` couldn't find an admittedly-visible-on-screen
    modal). Fixed in the new component by removing `aria-hidden` from the
    wrapper. **Not fixed** in `FilterModeModal.vue` / `ConfirmDialog.vue`
    (same bug, pre-existing, out of scope for this task) — flagging here for
    a future cleanup pass; those two have the identical wrapper markup.
  Verification: ✅ typecheck/eslint clean, ✅ 358/358 unit tests (18 new: 7 for
  the modal component incl. Escape/Cancel/reset-on-reopen, 4 for the
  SettingsView wiring incl. the tab-switch and auto-select-vs-toast branches).
  ✅ Real browser, full round-trip against routed POST/PATCH stubs: desktop
  calendar "＋ Add new…" → webhook created → modal closes → select shows the
  new URL selected, confirmed via a real network assertion that
  `updateAccount` was called with it; mobile digest "＋ Add new…" → title
  switches to "Email & Forwarding" → pending email created → toast with the
  exact expected message visible, select correctly NOT changed. Screenshots
  confirm all states visually.

- [x] **7 & 8. PWA notifications: icon, deep-link, PWA-first click, action
  buttons; + Android/iOS UX writeup** — **DONE.**
  Decisions: (a) **foreground-only** — notifications stay triggered by the
  existing SharedWorker realtime connection (an open tab/installed PWA), same
  architecture as before; true background Web Push (VAPID keys, push
  subscriptions, a backend send endpoint) is explicitly OUT of scope, a much
  larger separate feature. (b) Action buttons are **navigation-only** — they
  deep-link, no business-logic side effects run from the service worker
  itself (that would need an auth token cached somewhere reachable outside
  any open page — real infrastructure, not attempted here). (c) The test
  notification deep-links to `/settings?tab=email-forwarding` (where the
  "Send test notification" button itself lives), so clicking it proves the
  full round trip lands you back where you started.

  **Implementation:**
  - `vite.config.ts` — `strategies: 'injectManifest'`, `srcDir: 'src'`,
    `filename: 'sw.ts'`; `pwaAssets` (icon generation) is untouched, confirmed
    independent of `strategies`. Added `workbox-core`/`workbox-precaching`/
    `workbox-routing` as explicit devDependencies (were only present
    transitively before — `injectManifest` needs them declared, matching
    vite-plugin-pwa's own setup docs).
  - New `src/sw.ts` — precache + `NavigationRoute` SPA fallback (reproducing
    what `generateSW`'s `navigateFallback`/`cleanupOutdatedCaches` config used
    to auto-generate, now written by hand since `injectManifest` doesn't
    configure those for you), plus the new `notificationclick` handler:
    focuses an already-open app window and `postMessage`s the target path
    (this — not always opening a new tab — is what makes it "PWA-first");
    falls back to `clients.openWindow()` (resolved against
    `self.registration.scope`, so it's correct under any deploy base path)
    only when no window is open.
  - `src/lib/notifications.ts` — rewritten. `notify()` now **always** shows via
    `registration.showNotification()` and never `new Notification()` — a
    registration-shown notification has no client-side object to attach
    `.onclick` to, so click routing necessarily moved into the SW's own
    `notificationclick` listener above; this incidentally also removed the old
    "Illegal constructor on Chrome Android" `new Notification()` fallback
    workaround entirely, since there's no constructor path left to fall back
    from. New contract: `url` (body-click target) and `actions: {action,
    title, url?}[]` (an action with no `url` just closes on click) replace the
    old `onClick` callback. Defaults `icon` to `pwa-192x192.png` and `badge`
    to a **new hand-authored asset**, `public/notification-badge.png` (bold
    filled envelope glyph, rasterized via `sharp` from a hand-written SVG —
    `@vite-pwa/assets-generator` has no first-class "badge" asset type, so
    this couldn't be generated the way the manifest icons are).
  - `useRealtime.ts` — `fireNotification` now calls `notify()` with
    `url: '/threads/<id>'` instead of the raw `showNotification` helper (now
    private/unexported).
  - `SettingsView.vue` — test notification sends `url:
    '/settings?tab=email-forwarding'` and two actions (`Open Settings`,
    `Dismiss`), the two explicit test cases asked for.
  - `OnboardingCoach.vue` — its demo notification drops `onClick` (no real
    target — it's illustrative, not a real thread).
  - `AppLayout.vue` — new `navigator.serviceWorker.addEventListener('message',
    ...)` listener, routing a `notification-navigate` message to
    `router.push()` — the client-side half of the SW's focus+postMessage path.

  **Verification:** ✅ typecheck/eslint clean, ✅ 364/364 unit tests (6 new for
  `notify()`, covering permission/SW-availability gating, default icon/badge,
  and the actions→actionUrls mapping). ✅ Clean production build confirms
  `mode: injectManifest`, 60 precache entries, and `dist/sw.js` contains the
  `notificationclick`/`openWindow`/`actionUrls` code alongside the injected
  precache manifest — not just one or the other. ✅ Real browser (installed SW,
  not mocked): `context.serviceWorkers()` confirms exactly one active
  registration at `/sw.js`; triggering the real "Send test notification" flow
  and reading it back via `registration.getNotifications()` confirms the
  actual shown notification has the correct icon/badge paths, both actions,
  and `data.url`/`data.actionUrls` populated as designed.

  ---
  **Android/iOS notification UX research** (the explicit "what are all the
  different UX options" ask):

  | Capability | Android Chrome/Firefox | Desktop Chrome/Edge/Firefox (Win/macOS/**Linux**) | iOS/iPadOS Safari (installed PWA only) |
  |---|---|---|---|
  | Requires install? | No — works in a regular browser tab | No | **Yes, hard requirement** — Home Screen–installed PWA only; a regular Safari tab cannot request notification permission at all |
  | title / body / icon | ✅ | ✅ | ✅ (icon customization more limited — leans on the app icon) |
  | `badge` (small monochrome status icon) | ✅ | Rendered less prominently (desktop notification centers emphasize the full icon) | Effectively ignored — no status-bar equivalent |
  | `tag` / `renotify` (collapse duplicates) | ✅ | ✅ | ✅ |
  | `actions` (buttons) | ✅ up to 2, inline on the notification | ✅ up to 2 on Chrome/Edge/Firefox — **on Linux specifically, rendering depends on the system notification daemon** (GNOME/KDE's render them; a bare `dunst` setup may not without configuration) | ❌ **never** — WebKit omits the `actions` field entirely, unconditionally, regardless of what's specified |
  | `image` (large banner) | ✅ | ✅ | ❌ |
  | `vibrate` | ✅ | N/A (no vibration hardware) | ❌ |
  | `requireInteraction` (stays until dismissed) | ✅ | ✅ | ❌ (iOS notifications always auto-dismiss per system behavior) |
  | Click → deep-link (`notificationclick`) | ✅ | ✅ | ✅ — single tap still routes correctly even though action buttons don't exist |
  | Click → focus existing app window ("PWA-first") | ✅ if installed; a plain browser tab notification opens/focuses that tab | ✅ | ✅ (opens/focuses the installed Home Screen app) |

  Degradation: no runtime feature-detection was needed to keep this safe —
  `NotificationOptions` fields a platform doesn't support (`actions` on iOS,
  `vibrate` on desktop, etc.) are spec'd to be silently ignored, not rejected,
  so `notify()` can pass the same options everywhere and each platform just
  renders what it understands. The one thing this means in practice: don't
  make an action the *only* way to reach some functionality — iOS users can
  never see it, so the body-click `url` should always cover the primary
  action too (already true for the test notification: both an action and the
  body click go to the same place).

- [ ] **9. Rules screen — unify rows; toggle for ALL rules; reorder for USER
  rules; mobile tap→popup (Edit/Delete); desktop Delete→overflow; fix broken
  display.**
  - 🔎 **BACKEND CONSTRAINT (decisive):** `rulesApi.ts:117-124` — system rules
    (`accountId==='SYSTEM'`, id `SR-*`) are IMMUTABLE except `status`; any other
    change (incl. `priorityOrder`) → HTTP **403 `SYSTEM_RULE_IMMUTABLE`**.
    System rules also cannot be deleted (`rulesApi.ts:193`). Their order is
    code-defined (`processor/system-rules.ts`, fixed positions 100…1800). So
    "reorder arrows on all rules" is **not possible for system rules** without a
    backend change (would need a per-account priorityOrder override, like the
    existing status override). → **DECISION: (b)** add backend support to reorder
    system rules too. Becomes a two-repo change:
    - **Backend (`SES-Email-Adapter`):** (1) `rulesApi.ts:117-124` — for system
      rules allow `status` AND `priorityOrder` (still reject other fields);
      (2) `account-database.ts` — generalize `upsertSystemRuleStatus` →
      `upsertSystemRuleOverride(accountId, ruleId, { status?, priorityOrder? })`
      that READS the existing SR- override, merges, and writes the full item with
      effective status + priorityOrder + correct `gsi1sk`; (3) `listRules` merge
      (line 632-634) must override BOTH status and priorityOrder from the DDB SR-
      row, not just status; (4) add/adjust backend rule-API tests; (5) mirror this
      task into the backend repo's own `TODO.md` (its CLAUDE.md mandates it).
    - **Frontend:** render ONE unified list of all rules (already sorted by
      priorityOrder); `moveRule`'s global-index logic becomes correct once the
      list is unified, so the corruption bug disappears; arrows + toggle on every
      row. Update `dev:mock` PATCH handler so system-rule reorder works in mock.
    - ⚠️ Semantics: system rules interleave with user rules by priorityOrder
      (system 100-1800, user 1801+); reordering now lets a user rule run before a
      system rule. Confirm processor behavior is acceptable during backend work.
  - 🔎 Confirmed reorder bug: `moveRule(id, ±1)` (`stores/rules.ts`) walks the
    FULL sorted `items` list by global index while `RulesView` passes a filtered
    `userRules` index. Moving the top user rule "up" tries to swap priority with
    the adjacent **system** rule → that half 403s while the user-rule half
    succeeds → corrupted/duplicate priorityOrder. Fix: reorder strictly WITHIN
    the user-rule group using explicit neighbor IDs (reuse `reorderRule(dragId,
    targetId)` semantics), never crossing into system rules.
  - 🔎 Toggle IS supported for all rules (system via status-override path, user
    normally) — safe to add an enable/disable toggle to user rules too.
  - 🔎 Mock caveat: `dev:mock` PATCH handler does not enforce the 403, so reorder
    will *appear* to work in mock but fail against prod — verify against a real
    backend or add the guard to the mock.
  - ❓ Mobile tap-popup mechanism: reuse `OverflowMenu` bottom sheet vs. a
    dedicated dialog. (Desktop Delete → `OverflowMenu` ⋮.)
  - ❓ Pin down what "display wrong everywhere" is once running (candidates: two
    divergent row layouts, raw ▲▼ text glyphs, badge wrapping, disabled opacity,
    the reorder error surfacing). Inspect via running app before restyling.
