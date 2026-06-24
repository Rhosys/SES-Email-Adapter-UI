# Design: Pinia localStorage Cache Layer

## Overview

Custom Pinia plugin that automatically persists and hydrates `_byAccount`-keyed store state to localStorage. Stores opt in via a `persist` option — no manual `read()`/`write()` calls in store code. Implements stale-while-revalidate: show cached data instantly on load, merge fresh API data in the background. All storage keyed by accountId. Only active arcs cached (via configurable filter).

## Plugin Evaluation (R8)

`pinia-plugin-persistedstate` (the main option) was archived Aug 2025. It persists entire store state under a single static key — doesn't support dynamic account-keyed namespacing, selective status filtering on write, or merge-on-revalidate semantics. **Decision: write our own Pinia plugin** that hooks into `$subscribe` for automatic persistence and hydrates on store creation.

## Components and Interfaces

### Pinia Plugin (`src/plugins/persistent-store.ts`)

```typescript
import type { PiniaPluginContext } from "pinia"
import logger from "@/lib/logger"

const VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PersistOptions {
  // Which top-level state key holds per-account data (default: '_byAccount')
  accountKeyedRef?: string
  // Filter applied to items array before writing (e.g., only active arcs)
  filter?: (items: unknown[]) => unknown[]
}

declare module "pinia" {
  interface DefineStoreOptionsBase<S, Store> {
    persist?: PersistOptions
  }
}

export function persistentStorePlugin(context: PiniaPluginContext): void
```

### Plugin Registration (`src/main.ts`)

```typescript
import { persistentStorePlugin } from "@/plugins/persistent-store"

const pinia = createPinia()
pinia.use(persistentStorePlugin)
```

### Store Opt-In (zero persistence code in store body)

```typescript
export const useArcsStore = defineStore("arcs", () => {
  const _byAccount = ref<Record<string, Arc[]>>({})         // persisted by plugin
  const _cursors = ref<Record<string, string | undefined>>({})  // ephemeral, not persisted
  // ... normal store logic, no persistence imports or calls ...
  return { /* ... */ }
}, {
  persist: {
    accountKeyedRef: "_byAccount",
    filter: (items) => (items as Arc[]).filter((a) => a.status === "active"),
  },
})
```

### Arcs Store — New Exports (R12)

```typescript
export function getArc(arcId: string): Arc | undefined
export async function getArcAsync(arcId: string): Promise<Arc | undefined>
export const activeCount: ComputedRef<number>  // replaces ref
```

### Signals Store — New Shape (R7.3)

```typescript
const _byAccount = ref<Record<string, Signal[]>>({})
// arc ref REMOVED — consumers use arcsStore.getArc(arcId)
```

### Quarantine Store — New Exports (R7.7)

```typescript
export const visibleCount: ComputedRef<number>  // replaces ref
```

## Data Models

### localStorage Value Envelope

```typescript
interface CacheEnvelope<T> {
  data: T
  writtenAt: number  // Date.now() at write time
}
```

### Per-Store Cached Shapes

The plugin persists whatever is at `state[accountKeyedRef][accountId]` — the shape is whatever the store naturally holds. Cursors are stored in separate refs that the plugin does NOT persist.

| Store | `_byAccount[accountId]` shape (persisted) | Separate ephemeral state |
|-------|-------------------------------------------|--------------------------|
| arcs | `Arc[]` | `_cursors: Record<string, string \| undefined>` |
| signals | `Signal[]` | None |
| quarantine | `{ visible: Signal[], hidden: Signal[] }` | `_cursors: Record<string, { visible?: string, hidden?: string }>` |
| labels | `Label[]` | None |
| views | `View[]` | None |
| templates | (after migration to `_byAccount`) | None |
| rules | (after migration to `_byAccount`) | None |

## Architecture

```
src/plugins/persistent-store.ts  — Pinia plugin (subscribe + hydrate)
src/stores/arcs.ts               — opts in via { persist: {...} }
src/stores/signals.ts            — opts in via { persist: {...} }
src/stores/quarantine.ts         — opts in via { persist: {...} }
src/stores/labels.ts             — opts in via { persist: {} }
src/stores/views.ts              — opts in via { persist: {} }
src/stores/templates.ts          — opts in via { persist: {} } (after _byAccount migration)
src/stores/rules.ts              — opts in via { persist: {} } (after _byAccount migration)
```

## localStorage Key Format

```
ses:v{VERSION}:{accountId}:{storeId}
```

- `ses:` — app namespace (consistent with existing `ses:` prefix keys)
- `v{VERSION}` — numeric integer, bumped on schema change
- `{accountId}` — account isolation
- `{storeId}` — Pinia store `$id` (e.g., `arcs`, `signals`, `quarantine`)

Examples:
```
ses:v1:acc_abc123:arcs
ses:v1:acc_abc123:signals
ses:v1:acc_abc123:quarantine
ses:v1:acc_abc123:labels
```

Multi-tab safety: each tab reads/writes only keys for its own accountId. Different tabs with different accountIds never collide.

## Plugin Internals

### Hydration (on store creation)

```typescript
const accountId = accountStore.accountId
if (accountId) {
  const cached = readFromLocalStorage<StoreSlice>(accountId, store.$id)
  if (cached) {
    const current = store.$state[refName] ?? {}
    store.$patch({ [refName]: { ...current, [accountId]: cached } })
  }
}
```

### Auto-Persist (on every state mutation)

```typescript
store.$subscribe((_mutation, state) => {
  const id = accountStore.accountId
  if (!id) return
  const accountData = state[refName]?.[id]
  if (!accountData) return

  let toWrite = accountData
  if (config.filter && Array.isArray(accountData.items)) {
    toWrite = { ...accountData, items: config.filter(accountData.items) }
  }

  writeToLocalStorage(id, store.$id, toWrite)
})
```

### Read from localStorage

1. `localStorage.getItem(key)` — if null → return `undefined`
2. `JSON.parse()` — on SyntaxError: remove key, `logger.warn()`, return `undefined`
3. Check `writtenAt` — if older than MAX_AGE_MS: remove key, return `undefined`
4. Return `parsed.data`

### Write to localStorage

1. `JSON.stringify({ data, writtenAt: Date.now() })`
2. `localStorage.setItem(key, json)`
3. On error: `logger.warn()`, continue

### Remove All for Account

Iterate localStorage keys, remove any matching `ses:v{VERSION}:{accountId}:*`. Used by revoked-account cleanup (R11).

## Store-Level Changes

### Arcs Store

- Split `_byAccount` into `_byAccount: Record<string, Arc[]>` (persisted) and `_cursors: Record<string, string | undefined>` (ephemeral)
- Add `persist` option with active-only filter
- Convert `activeCount` / `activeCountHasMore` to `computed()` derived from `_byAccount`
- Add `getArc(arcId)` / `getArcAsync(arcId)` (R12)
- Merge logic in `fetchArcs`: diff fresh vs existing rather than replace (avoids UI flash)
- `loading` only set to `true` if no cached data exists for the account

### Signals Store

- Remove `arc` ref — components use `arcsStore.getArc(arcId)`
- Migrate to `_byAccount` pattern: `Record<string, Signal[]>`
- Add `persist` option (no filter)
- Merge on revalidate: since signals are immutable, fetch only signals newer than latest cached `createdAt`, prepend

### Quarantine Store

- Add `persist` option (no filter)
- Convert `visibleCount` / `visibleCountHasMore` to `computed()`
- Merge on revalidate: same pattern as arcs

### Templates & Rules Stores

- Migrate from flat `items` ref to `_byAccount` pattern
- Add `persist` option (no filter)

### Account Store

- Revoked-account cleanup (R11): after fetching account list, scan localStorage for orphaned accountIds and call `removeAllForAccount()`

### ArcDetailView Component

- Read arc from `arcsStore.getArc(arcId)` / `getArcAsync(arcId)` instead of `signalsStore.arc`

## Account Switch Flow

1. User clicks switch → `switchAccount(newId)` writes to session/localStorage
2. `window.location.assign('/')` navigates to inbox
3. App reinitializes → Account_Store resolves new accountId from sessionStorage
4. Plugin hydrates each opt-in store from `ses:v1:{newId}:*`
5. Computeds return hydrated data → UI renders instantly
6. Background fetches fire → merge fresh data → `$subscribe` auto-persists updated state
7. Route navigation resets ephemeral UI state (selections, filters, tab)

## File Changes

| File | Change |
|------|--------|
| `src/plugins/persistent-store.ts` | **NEW** — Pinia plugin |
| `src/main.ts` | Register plugin with `pinia.use()` |
| `src/stores/arcs.ts` | Add `persist` option, `getArc`/`getArcAsync`, convert counts to computed, merge logic |
| `src/stores/signals.ts` | Remove `arc` ref, migrate to `_byAccount`, add `persist` option, merge logic |
| `src/stores/quarantine.ts` | Add `persist` option, convert counts to computed, merge logic |
| `src/stores/templates.ts` | Migrate to `_byAccount`, add `persist` option |
| `src/stores/rules.ts` | Migrate to `_byAccount`, add `persist` option |
| `src/stores/labels.ts` | Add `persist` option (already `_byAccount`) |
| `src/stores/views.ts` | Add `persist` option (already `_byAccount`) |
| `src/stores/account.ts` | Add revoked-account cleanup |
| `src/views/ArcDetailView.vue` | Read arc from arcs store |

## Execution Order

1. Create `src/plugins/persistent-store.ts` + register in `main.ts`
2. Migrate signals/templates/rules stores to `_byAccount` pattern (R7.3)
3. Add `persist` option to all target stores (enables auto-persist + hydration)
4. Convert `activeCount`/`visibleCount` to computed (R7.7)
5. Add `getArc`/`getArcAsync` to arcs store, update ArcDetailView (R12)
6. Add merge-on-revalidate logic to arcs/signals/quarantine (R4.3, R5.2, R10.5)
7. Add "loading only if no cache" behavior to fetch functions
8. Add revoked-account cleanup to account store (R11)

## Error Handling

| Failure | Response |
|---------|----------|
| `localStorage.getItem()` returns null | Return `undefined` — cache miss, store starts empty |
| `JSON.parse()` throws SyntaxError | Remove corrupted key, `logger.warn()`, return `undefined` |
| `localStorage.setItem()` throws (quota/unavailable) | `logger.warn()`, continue — store works without cache |
| `writtenAt` older than 7 days | Remove stale key, return `undefined` |
| API fetch fails after cache hydration | Retain cached data, `logger.warn()`, no user-visible error |
| Version mismatch (old key format) | Old keys never matched — they have different version segment |

All errors are non-fatal. The app always functions without cache — it just shows loading states instead of instant data.

## Correctness Properties

### Property 1: Account Isolation
Each tab reads/writes only keys containing its own accountId. Two tabs with different accounts never interfere.

**Validates: Requirements 1.5, 7.2, 8.7**

### Property 2: Monotonic Freshness
After a successful API merge, the store state is at least as fresh as the API response. The `$subscribe` auto-persists the merged result.

**Validates: Requirements 4.3, 5.2, 10.5**

### Property 3: No Stale Renders
Entries older than 7 days are discarded on read. The user sees loading state rather than week-old data.

**Validates: Requirements 2.6, 10.2**

### Property 4: Status Invariant
The arcs store `filter` function excludes non-active arcs before every write. Defensive filter on read handles legacy data.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 5: Automatic Persistence
`$subscribe` fires on every state mutation. No store action can forget to persist — it happens automatically.

**Validates: Requirements 2.1, 2.4, 3.1, 10.1**

### Property 6: Graceful Degradation
If localStorage throws on any operation, the error is caught and logged. The store continues normally without persistence.

**Validates: Requirements 8.2, 8.3**

## Testing Strategy

- Unit tests for plugin: hydration on store creation (cache hit/miss/expired/corrupted), auto-persist on mutation, filter application, version mismatch handling
- Unit tests for merge logic in stores: arcs merge (add/remove/update without flash), signals merge (prepend immutable), quarantine merge
- Unit tests for `getArc`/`getArcAsync`: cache hit returns + fires background, cache miss awaits
- Unit tests for revoked-account cleanup: orphaned keys removed, active keys preserved
- Integration test: full cycle — hydrate → show cached → fetch → merge → verify localStorage updated
- Integration test: account switch → correct cache loaded for new account
