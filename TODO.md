# SES Email Adapter UI — Build Plan

## Open tasks

- [ ] Write marketing homepage copy (value prop, screenshots, CTA)
- [ ] Set up favicon and Open Graph meta tags
- [ ] Implement all phases below (Phases 2, 4–10)

---

This document is the working specification for the Vue 3 frontend that talks to
the `ses-email-adapter` API. It is the canonical source for what's in scope and
the order in which features land.

The authoritative product spec lives in `rhosys/ses-email-adapter` on branch
`claude/build-ai-app-ECGgR` (`TODO.md`). When that document changes, sync the
UI section into this file and re-export `src/types/server.ts` from the server's
`src/types/index.ts`.

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

## Phase 1 — Project bootstrap (this commit)

- Vite + Vue + TS scaffold, path alias `@ → src`
- Vue Router with placeholder routes
- Pinia stores: `account`, `arcs`, `theme`
- `@authress/login` wired into the account store (login redirect on 401)
- Typed fetch-based API client (`src/api/client.ts`)
- App shell: top bar, sidebar, main outlet
- Catppuccin theme system: 4 flavors as CSS custom properties, persisted via
  the theme store, applied to `<html data-theme="…">`
- Vitest + Playwright configs and seed tests (component + e2e + style/color)

## Phase 2 — Onboarding flow

Five-step wizard at `/onboarding`:

1. **Domain** — capture sending domain, show DNS records (two-tier display)
2. **Send test email** — render a real-time signal-arrival indicator (SSE or
   polling) so the user sees ingestion working end-to-end
3. **Sender setup** — pick a default sender address, set display name
4. **Filter mode** — choose strict / balanced / permissive default rule mode
5. **Done** — recap card, link into the inbox

## Phase 3 — Core inbox ✓ DONE

- Arc list (cursor-paginated) at `/`
- Per-row: urgency color stripe, workflow icon, summary, last-signal age, label chips
- Auth+critical arcs pinned to top of Inbox view
- Status tabs: Inbox (active) / Archived / All
- Bulk select + bulk archive + bulk label
- Empty / loading / error states
- `npm run check` gate: typecheck + ESLint (flat config) + Prettier + 39 unit/component tests

## Phase 4 — Arc detail

- Route `/arcs/:id`
- Threaded signal list, newest first
- Workflow-specific data panels (e.g. quote, invoice, support ticket)
- Reply composer with markdown preview
- Pong reply card (the structured reply the adapter generates)
- Inline label, snooze, assign actions

## Phase 5 — Quarantine view

- Route `/quarantine`
- List of blocked / quarantined signals
- Allow + dismiss actions, with reason capture
- Filter by rule that fired, sender, date

## Phase 6 — Labels & views

- Manage labels (CRUD, color, icon)
- Custom sidebar views backed by saved searches
- Drag-to-reorder sidebar entries; persists to the account store / API

## Phase 7 — Rules engine

- Visual condition builder emitting JSONLogic
- Action list (label, snooze, forward, quarantine, auto-reply with a pong)
- Rule test runner that evaluates a sample signal against the rule

## Phase 8 — Search

- Global full-text search at `/search`
- Filter chips (workflow, label, urgency, date range, sender)
- Cursor-paginated results sharing the inbox row component

## Phase 9 — Settings

- Account profile
- Email addresses (sender + reply-to)
- Domains with two-tier DNS display (apex + DKIM/SPF/DMARC subrecords)
- Forwarding addresses
- Team / users (Authress RBAC: invite, role, remove)

## Phase 10 — Secondary screens

- Profile, billing, audit log, support panel
- Legal pages (terms, privacy)
- Notification preferences

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
- The API client is the only place `fetch` is called
- New colors and tokens go through the Catppuccin palette — never hard-code
  hex values in components
