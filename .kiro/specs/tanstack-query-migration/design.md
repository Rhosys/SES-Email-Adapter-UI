# Technical Design: TanStack Query Migration

## Overview

Replace the hand-rolled fetch/cache/persist layer across 10+ Pinia stores with `@tanstack/vue-query` v5. The API layer (`src/lib/api.ts`) remains unchanged. Pinia stores shrink to holding only UI-local state (selection, actionPending, derived computeds). All server-state concerns (fetching, caching, pagination, staleness, persistence, deduplication, retry) move to TanStack Query composables and a centralized QueryClient.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Vue Components / Views                                             │
│    useQuery() / useInfiniteQuery() / useMutation()                  │
│    Pinia stores (selection, actionPending, derived counts)          │
├─────────────────────────────────────────────────────────────────────┤
│  Query Key Factory (src/lib/queryKeys.ts)                           │
│  Retry Logic (src/lib/queryRetry.ts)                                │
├─────────────────────────────────────────────────────────────────────┤
│  QueryClient (src/lib/queryClient.ts)                               │
│    ├── IndexedDB Persister (createAsyncStoragePersister)             │
│    ├── BroadcastQueryClient (multi-tab sync)                        │
│    └── QueryCache / MutationCache (global error logging)            │
├─────────────────────────────────────────────────────────────────────┤
│  API Layer (src/lib/api.ts) — unchanged                             │
│    Result<T, ApiError> → throw conversion in queryFn wrappers       │
├─────────────────────────────────────────────────────────────────────┤
│  WebSocket SharedWorker (src/workers/realtime.shared.ts) — unchanged│
│    → useRealtime composable calls queryClient.invalidateQueries()   │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### QueryClient (singleton)
- Central cache manager, retry orchestrator, and plugin host
- Created once in `src/lib/queryClient.ts`, provided to Vue via `VueQueryPlugin`
- Owns: QueryCache, MutationCache, persister, broadcast channel

### Query Key Factory (`queryKeys`)
- Typed key builder functions per resource
- Interface: `queryKeys.resource.all(accountId)` → partial key for invalidation
- Interface: `queryKeys.resource.list(accountId, filters)` → full key for specific query

### Query Composables (per resource)
- Interface: `useXxxQuery(filters?)` → returns `{ data, isLoading, error, isFetching, fetchNextPage?, hasNextPage? }`
- Interface: `useXxxMutation()` → returns `{ mutate, isPending, error }`

### Retained Pinia Stores
- Interface: selection state (`selectedIds`, `toggleSelect`, `selectAll`, `clearSelection`)
- Interface: mutation-tracking flags (`actionPending`, `bulkActionPending`)
- No fetch methods, no loading/error/cursor state

## Data Models

No new data models introduced. Existing types (`Thread`, `Signal`, `BlockedSignal`, `QuarantinedSignal`, `Rule`, `Label`, `View`, `EmailTemplate`, `Resource`, `StatsResponse`) remain unchanged. TanStack Query wraps them in its internal cache structure (keyed by query key, with metadata like `dataUpdatedAt`, `state`, `fetchStatus`).

The persister serializes/deserializes these same types to/from IndexedDB via JSON structured clone.

## New Files

| File | Purpose |
|------|---------|
| `src/lib/queryClient.ts` | QueryClient instantiation, defaults, persister, broadcast, global error handlers |
| `src/lib/queryKeys.ts` | Typed query key factory for all resources |
| `src/lib/queryRetry.ts` | Shared retry function (skip 4xx, retry 5xx/network) |
| `src/lib/queryFns.ts` | Query function wrappers that convert `Result<T, ApiError>` → throw on error |
| `src/composables/useSpamQueries.ts` | useInfiniteQuery + useMutation composables for spam |
| `src/composables/useQuarantineQueries.ts` | useInfiniteQuery + useMutation composables for quarantine |
| `src/composables/useThreadQueries.ts` | useInfiniteQuery + useMutation composables for threads |
| `src/composables/useSignalQueries.ts` | useInfiniteQuery + useMutation composables for signals |
| `src/composables/useResourceQueries.ts` | useQuery + useMutation composables for resources |
| `src/composables/useStatsQuery.ts` | useQuery composable for stats |
| `src/composables/useRulesQueries.ts` | useQuery + useMutation composables for rules |
| `src/composables/useLabelsQueries.ts` | useQuery + useMutation composables for labels |
| `src/composables/useViewsQueries.ts` | useQuery + useMutation composables for views |
| `src/composables/useTemplatesQueries.ts` | useQuery + useMutation composables for templates |
| `src/composables/useSenderIdentitiesQuery.ts` | useQuery composable for sender identities |

## Deleted / Gutted Files

| File | Change |
|------|--------|
| `src/plugins/persistent-store.ts` | Deleted entirely — replaced by IndexedDB persister |
| `src/stores/spam.ts` | Gutted to actionPending + blockedCount (derived from query cache) |
| `src/stores/quarantine.ts` | Gutted to actionPending + visibleCount (derived from query cache) |
| `src/stores/threads.ts` | Gutted to selection state + activeCount (derived from query cache) |
| `src/stores/signals.ts` | Gutted to currentThreadId only (query cache holds signal data) |
| `src/stores/stats.ts` | Deleted — replaced entirely by useStatsQuery composable |
| `src/stores/rules.ts` | Gutted to savePending flag only |
| `src/stores/labels.ts` | Deleted — replaced by useLabelsQueries composable |
| `src/stores/views.ts` | Deleted — replaced by useViewsQueries composable |
| `src/stores/templates.ts` | Deleted — replaced by useTemplatesQueries composable |
| `src/stores/resources.ts` | Deleted — replaced by useResourceQueries composable |
| `src/stores/senderIdentities.ts` | Deleted — replaced by useSenderIdentitiesQuery composable |

## Component: Query Key Factory

```typescript
// src/lib/queryKeys.ts

export const queryKeys = {
  threads: {
    all: (accountId: string) => ['threads', accountId] as const,
    list: (accountId: string, status?: string) =>
      status ? ['threads', accountId, { status }] as const
             : ['threads', accountId] as const,
    detail: (accountId: string, threadId: string) =>
      ['threads', accountId, threadId] as const,
  },
  signals: {
    all: (accountId: string) => ['signals', accountId] as const,
    byThread: (accountId: string, threadId: string) =>
      ['signals', accountId, threadId] as const,
  },
  quarantine: {
    all: (accountId: string) => ['quarantine', accountId] as const,
    list: (accountId: string, filters: { sender?: string; after?: string; before?: string }) =>
      ['quarantine', accountId, filters] as const,
  },
  spam: {
    all: (accountId: string) => ['spam', accountId] as const,
    list: (accountId: string, filters: { sender?: string; after?: string; before?: string }) =>
      ['spam', accountId, filters] as const,
  },
  stats: (accountId: string) => ['stats', accountId] as const,
  rules: {
    all: (accountId: string) => ['rules', accountId] as const,
  },
  labels: {
    all: (accountId: string) => ['labels', accountId] as const,
  },
  views: {
    all: (accountId: string) => ['views', accountId] as const,
  },
  templates: {
    all: (accountId: string) => ['templates', accountId] as const,
  },
  resources: {
    all: (accountId: string) => ['resources', accountId] as const,
    list: (accountId: string, params: { status?: string; dateFrom?: string }) =>
      ['resources', accountId, params] as const,
  },
  senderIdentities: (accountId: string) => ['senderIdentities', accountId] as const,
} as const
```

Filter params are included in the key — different filter combos = different cache entries. The `.all()` partial keys enable bulk invalidation via prefix matching.

## Component: Query Client Setup

```typescript
// src/lib/queryClient.ts

import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query'
import { experimental_createPersister } from '@tanstack/query-persist-client-core'
import { get, set, del } from 'idb-keyval'
import { broadcastQueryClient } from '@tanstack/query-broadcast-client-experimental'
import { shouldRetry } from './queryRetry'
import logger from '@/lib/logger'
import buildInfo from '@/lib/buildInfo'

const persister = experimental_createPersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  prefix: `ses:${buildInfo.version.buildCommit}:`,
  buster: buildInfo.version.buildCommit,
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      gcTime: Infinity,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      networkMode: 'online',
      structuralSharing: true,
      throwOnError: false,
      retryOnMount: true,
      persister,
    },
    mutations: {
      retry: shouldRetry,
      networkMode: 'online',
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      logger.error({
        code: 'query.failed',
        queryKey: query.queryKey,
        error,
        failureCount: query.state.failureCount,
        status: query.state.status,
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) => {
      logger.error({
        code: 'mutation.failed',
        mutationKey: mutation.options.mutationKey,
        variables,
        error,
      })
    },
  }),
})

broadcastQueryClient({ queryClient, broadcastChannel: 'ses-query-sync' })
```

## Component: Retry Logic

```typescript
// src/lib/queryRetry.ts

import { ApiError } from './api'

const MAX_RETRIES = 3

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  // Network errors (ApiError with status 0) always retry
  if (error instanceof ApiError) {
    if (error.status === 0) return true        // network error
    if (error.status >= 500) return true        // server error
    return false                                // 4xx — don't retry
  }
  // Unknown errors — retry once as a safety net
  return failureCount < 1
}
```

## Component: Query Function Wrappers

The existing `api.*` methods return `Result<T, ApiError>`. TanStack Query expects `queryFn` to throw on failure. A thin wrapper converts:

```typescript
// src/lib/queryFns.ts

import type { Result } from 'neverthrow'
import type { ApiError } from './api'

export function unwrap<T>(result: Result<T, ApiError>): T {
  if (result.isErr()) throw result.error
  return result.value
}
```

Each composable's queryFn calls `api.listThreads(...)` then passes the result through `unwrap()`.

## Component: Example Composable (Spam)

```typescript
// src/composables/useSpamQueries.ts

import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { SpamFilters } from '@/types/filters'
import type { BlockedSignal } from '@/types/server'

export function useSpamQuery(filters: () => SpamFilters) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const hiddenQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.spam.list(accountId.value!, filters()), 'hidden']),
    queryFn: ({ pageParam }) =>
      unwrap(api.listBlockedSignals(accountId.value!, 'block_hidden', { ...filters(), cursor: pageParam, limit: 50 })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  const rejectQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.spam.list(accountId.value!, filters()), 'reject']),
    queryFn: ({ pageParam }) =>
      unwrap(api.listBlockedSignals(accountId.value!, 'block_reject', { ...filters(), cursor: pageParam, limit: 50 })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  const blockHidden = computed<BlockedSignal[]>(() =>
    hiddenQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  const blockReject = computed<BlockedSignal[]>(() =>
    rejectQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  return { hiddenQuery, rejectQuery, blockHidden, blockReject }
}

export function useDeleteSpamSignal() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: (signalId: string) =>
      unwrap(api.deleteSignal(accountStore.accountId!, signalId)),
    onMutate: async (signalId) => {
      const accountId = accountStore.accountId!
      // Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.spam.all(accountId) })
      // Snapshot for rollback
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.spam.all(accountId) })
      // Optimistic removal
      queryClient.setQueriesData(
        { queryKey: queryKeys.spam.all(accountId) },
        (old: any) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              signals: page.signals.filter((s: BlockedSignal) => s.signalId !== signalId),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _signalId, context) => {
      // Rollback
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.spam.all(accountId) })
    },
  })
}
```

## Component: Realtime Integration

The existing `useRealtime` composable changes from calling `threadsStore.refreshThread()` to calling `queryClient.invalidateQueries()`:

```typescript
// Updated handleEvent in src/composables/useRealtime.ts

function handleEvent(event: RealtimeEvent) {
  const accountId = accountStore.accountId
  if (!accountId) return

  switch (event.type) {
    case 'signal:created':
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, event.threadId) })
      fireNotification(event)
      break
    case 'thread:updated':
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, event.threadId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, event.threadId) })
      break
  }
}
```

## Component: main.ts Changes

The startup fetch chain is eliminated. TanStack Query handles it:

1. App mounts → VueQueryPlugin registered with `queryClient`
2. AppLayout mounts → sidebar badge composables (`useSpamQuery`, `useQuarantineQuery`, `useThreadQuery`) automatically fire queries because they're `enabled` once `accountId` resolves
3. `refetchOnWindowFocus: true` handles tab-return refreshes (replaces the manual `visibilitychange` listener)
4. `useRealtime()` still initializes the SharedWorker — but its event handler now calls `queryClient.invalidateQueries()` instead of store methods

The manual startup waterfall (`accountStore.waitForFetch().then(...)`) is replaced by reactive `enabled` flags: queries fire as soon as their dependencies (accountId) are available.

## Component: Retained Pinia Stores

### threads.ts (gutted)

```typescript
// Selection state + derived counts only
export const useThreadsStore = defineStore('threads', () => {
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  function toggleSelect(id: string) { ... }
  function selectAll(ids: string[]) { ... }
  function clearSelection() { ... }

  return { selectedIds, bulkActionPending, toggleSelect, selectAll, clearSelection }
})
```

Badge counts (`activeCount`, `activeCountHasMore`) become computeds in the sidebar component that read from `useThreadQuery()`.data.

### spam.ts (gutted)

```typescript
export const useSpamStore = defineStore('spam', () => {
  const actionPending = ref<Set<string>>(new Set())
  function clearError() { /* no-op — error comes from query */ }
  return { actionPending, clearError }
})
```

`blockedCount` becomes a computed in the sidebar component that reads from `useSpamQuery()`.blockHidden.length + blockReject.length.

### quarantine.ts (gutted)

Same pattern as spam — only `actionPending` remains.

## Component: View Migration Pattern

Every view follows the same transformation:

**Before:**
```typescript
const loading = ref(true)
const store = useSpamStore()
onMounted(() => store.fetchSignals(filters.value))
// template: v-if="hasData" → v-else-if="loading" → v-else
```

**After:**
```typescript
const { blockHidden, blockReject, hiddenQuery, rejectQuery } = useSpamQuery(() => filters.value)
const isLoading = computed(() => hiddenQuery.isLoading.value || rejectQuery.isLoading.value)
const error = computed(() => hiddenQuery.error.value ?? rejectQuery.error.value)
// template: v-if="blockHidden.length || blockReject.length" → v-else-if="isLoading" → v-else
```

No `onMounted` fetch call, no `loading` ref, no `hasData` computed. TanStack Query manages the lifecycle.

## Component: Persister Storage (IndexedDB)

Uses `idb-keyval` (tiny IndexedDB wrapper, ~600B) for the async storage interface required by `experimental_createPersister`. Each query is persisted independently (lazy restore on first use, write after each queryFn run). The `prefix` includes the build commit hash — any deploy invalidates all cached entries.

## Component: Multi-Tab Sync

`broadcastQueryClient` from `@tanstack/query-broadcast-client-experimental` uses `BroadcastChannel` API. When one tab's mutation invalidates queries, other tabs receive the invalidation and refetch on their next observation. The channel name `'ses-query-sync'` is app-specific to avoid conflicts if multiple apps share the origin.

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/vue-query` | ^5 | Core query/mutation composables |
| `@tanstack/query-persist-client-core` | ^5 | Persister infrastructure |
| `@tanstack/query-broadcast-client-experimental` | ^5 | Multi-tab cache sync |
| `idb-keyval` | ^6 | Minimal IndexedDB key/value for persister storage |

## Dependencies Removed

None — Pinia stays for UI-local state. The `persistentStorePlugin` is deleted but Pinia itself remains.

## Migration Order

1. Install dependencies, create queryClient + queryKeys + queryRetry + queryFns
2. Register VueQueryPlugin in main.ts alongside Pinia
3. Migrate one store at a time (spam first — smallest surface, already diagnosed), creating the composable and gutting the store
4. After each store migration: run `npm run check`, verify the view renders correctly
5. Once all stores are migrated: delete `persistent-store.ts`, remove startup fetch chain from main.ts
6. Wire `useRealtime` to invalidate via queryClient instead of store methods
7. Final pass: remove dead code, unused imports, legacy persist options

## Correctness Properties

### Property 1: Filter Isolation
Different filter combinations produce different query keys → never serve cached data from a different filter state (the original bug that motivated this migration).

**Validates: Requirements 12.2**

### Property 2: Account Isolation
accountId in every key → switching accounts can never cross-contaminate cached data.

**Validates: Requirements 5.1**

### Property 3: Optimistic Consistency
Every optimistic mutation stores a rollback snapshot in onMutate context; on failure, the previous state is restored exactly.

**Validates: Requirements 8.2**

### Property 4: Eventual Consistency
`onSettled` always invalidates regardless of success/failure → server truth reconciles within one refetch cycle.

**Validates: Requirements 8.3**

### Property 5: Structural Sharing
Identical responses preserve reference identity → Vue's reactivity doesn't re-render unchanged subtrees.

**Validates: Requirements 7.2**

**Validates: Requirement 7.2**

## Error Handling

- **Query errors**: Captured in `query.error` reactive ref. Global `QueryCache.onError` logs all failures. Views render inline error banners from `query.error.value?.message`.
- **Mutation errors**: Captured in `mutation.error` reactive ref. Global `MutationCache.onError` logs all failures. Optimistic mutations roll back on error. Views can show error toasts or inline messages.
- **Retry boundary**: Only 5xx and network errors retry (up to 3). 4xx errors surface immediately — no wasted retries on client errors.
- **Persister errors**: IndexedDB unavailability is swallowed silently — the app works without persistence, just loses offline-start capability.
- **Broadcast errors**: BroadcastChannel unavailability is swallowed silently — single-tab operation continues normally.

## Testing Strategy

- **Unit tests**: Each query composable tested with `@tanstack/vue-query`'s test utilities (`QueryClientProvider` wrapper). Mock `api.*` methods, verify correct query keys, verify optimistic mutations + rollback.
- **Integration tests**: Existing Playwright e2e tests continue to validate full user flows. Mock server responses via MSW (already configured).
- **Migration validation**: After each store migration, `npm run check` (typecheck + lint + vitest) must pass. Views verified in dev server manually for correct loading/error/data states.

## Risks

1. **idb-keyval bundle size**: ~600B gzipped — negligible.
2. **broadcastQueryClient experimental status**: Uses BroadcastChannel under the hood — well-supported, low-risk mechanism. Graceful degradation if unavailable.
3. **Persister lazy restore timing**: On cold start, a query's persisted data is restored when its first observer mounts. If the sidebar badge mounts before the persister restores, it briefly shows 0. Acceptable — it's a single frame before the cached value appears.
4. **Result → throw conversion**: The `unwrap()` helper means ApiError instances flow through TanStack's error handling. The retry function already expects `ApiError` instances.
