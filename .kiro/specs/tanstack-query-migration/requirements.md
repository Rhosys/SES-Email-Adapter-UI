# Requirements Document

## Introduction

Migrate the email-catcher site's data fetching and caching layer from hand-rolled Pinia stores to @tanstack/vue-query (TanStack Query v5). The existing stores (spam, quarantine, threads, signals, stats) each manage their own `_byAccount` ref, cursors, loading flags, and error state with manual localStorage persistence via pinia-plugin. This migration replaces that fetch/cache plumbing with TanStack Query's stale-while-revalidate model while retaining Pinia for derived/computed state and mutations that don't map cleanly to TanStack.

## Glossary

- **Query_Client**: The TanStack Query client instance that manages the query cache, deduplication, garbage collection, and background refetching
- **Query_Key**: A serializable array that uniquely identifies a query; includes accountId, resource type, and filter parameters
- **Stale_Time**: The duration after a successful fetch during which cached data is considered fresh and no background refetch is triggered
- **GC_Time**: The duration after a query becomes unused (no active observers) before its cached data is garbage-collected from memory
- **Infinite_Query**: A TanStack Query primitive for cursor-based pagination that accumulates pages into a single cache entry
- **Broadcast_Client**: The @tanstack/query-broadcast-client-experimental plugin that synchronizes the query cache across browser tabs via BroadcastChannel
- **Persister**: A plugin that serializes the query cache to durable storage (IndexedDB) and restores it on app startup
- **Account_Namespace**: The accountId segment of a query key that isolates one account's cached data from another's
- **Signal**: An email event (inbound email, draft, system notification) belonging to a thread
- **Thread**: A conversation grouping of signals, with a status (active, archived, deleted) and metadata

## Configuration Decisions

| Option | Value | Rationale |
|--------|-------|-----------|
| staleTime | 5_000 (5s) | Short freshness window — triggers frequent enough for an email app |
| gcTime | Infinity | All data stays in memory for the session; badges derive from list data |
| retry (queries) | 3 with function: skip on 4xx, retry on 5xx/network | Transient failures recover; client errors don't waste attempts |
| retryDelay | exponential backoff (default) | 1s, 2s, 4s capped at 30s |
| refetchOnWindowFocus | true | Background refetch on tab return |
| refetchOnReconnect | true | Background refetch on network recovery |
| refetchOnMount | true | Background refetch when component mounts with stale data |
| refetchInterval | false | No polling — WebSocket pushes invalidation events |
| refetchIntervalInBackground | false | N/A (no polling) |
| networkMode | 'online' | Queries only fire when network is available |
| structuralSharing | true | Preserve references when data hasn't changed |
| throwOnError | false | Errors captured in reactive state, not thrown |
| retryOnMount | true | Failed queries re-attempt when a new observer mounts |
| mutation retry | function: retry 5xx/network up to 3, skip 4xx | Same transient-only logic as queries |
| mutation strategy | optimistic + rollback + invalidation on settle | Instant UI, rollback on failure, reconcile after |
| persister storage | IndexedDB | Async, non-blocking, no quota concerns |
| persister maxAge | 7 days | Discard entries older than 7 days on restore |
| persister key prefix | app version | Cache bust on deploy |
| global error handler | QueryCache onError → logger | All query failures logged centrally |
| multi-tab sync | broadcastQueryClient | BroadcastChannel-based cache sync |
| real-time updates | WebSocket → invalidateQueries | Backend pushes signal events, frontend invalidates relevant queries |

## Requirements

### Requirement 1: Query Client Initialization

**User Story:** As a developer, I want a single configured QueryClient instance available to the entire Vue app, so that all queries share consistent defaults for staleTime, gcTime, and retry behavior.

#### Acceptance Criteria

1. THE Query_Client SHALL be created with staleTime of 5000ms and gcTime of Infinity
2. THE Query_Client SHALL be provided to the Vue app via VueQueryPlugin so all components and composables can access it
3. THE Query_Client SHALL set a default retry function for queries that retries up to 3 times on 5xx and network errors, and does not retry on 4xx errors
4. THE Query_Client SHALL set the same conditional retry function for mutations
5. THE Query_Client SHALL configure a global QueryCache onError handler that logs all query failures via the app's logger with the query key and error object
6. THE Query_Client SHALL configure a global MutationCache onError handler that logs all mutation failures via the app's logger with the mutation key and error object

### Requirement 2: Offline Persistence

**User Story:** As a user, I want previously fetched data to be available immediately when I reopen the app, so that I see my inbox without waiting for a network round-trip.

#### Acceptance Criteria

1. WHEN the app starts, THE Persister SHALL restore the query cache from IndexedDB and complete restoration (or fail) before the Query_Client serves data to any component
2. WHEN a query cache entry is updated, THE Persister SHALL serialize the entry to IndexedDB within 2 seconds, debouncing rapid successive updates into a single write
3. THE Persister SHALL skip restoring cache entries whose age exceeds 7 days (maxAge)
4. THE Persister SHALL use a storage key prefixed with the app's version identifier to allow cache busting on deploys
5. IF IndexedDB is unavailable or corrupted, THEN THE Persister SHALL discard the stored cache and start fresh without throwing

### Requirement 3: Multi-Tab Synchronization

**User Story:** As a user with multiple tabs open, I want actions in one tab (archiving, deleting, allowing quarantined email) to reflect immediately in other tabs, so that I never act on stale data.

#### Acceptance Criteria

1. WHEN a query cache entry is updated in one tab, THE Broadcast_Client SHALL propagate the update to all other tabs within 1 second
2. WHEN a mutation invalidates queries in one tab, THE Broadcast_Client SHALL trigger refetches of those queries in other tabs within 1 second
3. IF the BroadcastChannel API is unavailable, THEN THE Broadcast_Client SHALL initialize without throwing errors, produce no user-visible error indicators, and leave all single-tab query and mutation behavior unchanged
4. WHEN a tab receives a broadcast invalidation for a query with no active observers, THE Broadcast_Client SHALL mark that query's cache entry as stale so it refetches on next observation rather than triggering an immediate network request

### Requirement 4: Window-Focus Refetching

**User Story:** As a user returning to the app after being away, I want fresh data to load automatically, so that I see new emails without manually refreshing.

#### Acceptance Criteria

1. WHEN the browser tab regains visibility (visibilitychange to "visible") or window focus, THE Query_Client SHALL refetch all active queries whose cached data has exceeded staleTime (5s)
2. WHILE the browser tab is hidden (document.visibilityState === "hidden"), THE Query_Client SHALL suppress background refetches to avoid unnecessary network traffic

### Requirement 5: Per-Account Query Key Namespacing

**User Story:** As a user with multiple accounts, I want each account's data isolated in the cache, so that switching accounts shows the correct data immediately without cross-contamination.

#### Acceptance Criteria

1. THE Query_Key for every data-fetching query SHALL include the active accountId as the first segment after the resource type
2. WHEN the user switches accounts, THE Query_Client SHALL serve cached data for the new accountId if available, without clearing the previous account's cache
3. WHEN the user switches accounts, THE Query_Client SHALL disable active observers for the previous accountId's queries so that window-focus refetching and interval-based refetching do not trigger requests for the previous account
4. WHEN the user switches accounts while queries for the previous accountId are in-flight, THE Query_Client SHALL cancel those in-flight requests

### Requirement 6: Cursor-Based Pagination

**User Story:** As a user browsing a long list of threads or signals, I want to load more results incrementally, so that I can paginate without losing already-loaded items.

#### Acceptance Criteria

1. THE Infinite_Query for threads SHALL accumulate pages in a single cache entry keyed by accountId and status filter
2. WHEN the user requests more results, THE Infinite_Query SHALL pass the last page's cursor to the API and append the response to existing pages
3. WHEN the query key changes (different filter or account), THE Infinite_Query SHALL discard accumulated pages and start from the first page
4. THE Infinite_Query for signals within a thread SHALL accumulate pages keyed by accountId and threadId
5. WHEN the API response contains no cursor (null or undefined), THE Infinite_Query SHALL report hasNextPage as false and prevent further fetchNextPage calls
6. IF a fetchNextPage request fails, THEN THE Infinite_Query SHALL retain all previously accumulated pages and expose the error without discarding loaded data

### Requirement 7: Stale-While-Revalidate Caching

**User Story:** As a user, I want to see cached data instantly while a background fetch updates it, so that navigation feels instant without sacrificing freshness.

#### Acceptance Criteria

1. WHEN a view mounts and cached data exists within staleTime (5s), THE Query_Client SHALL serve the cached data without triggering a network request
2. WHEN a view mounts and cached data exists but exceeds staleTime, THE Query_Client SHALL serve the cached data synchronously from cache and trigger a background refetch
3. WHEN a view mounts and no cached data exists, THE Query_Client SHALL set isLoading to true and data to undefined until the network response resolves
4. THE Query_Client SHALL expose per-query isFetching and isStale flags so views can distinguish between fresh cache hits and background revalidation
5. IF a background refetch triggered by stale data fails, THEN THE Query_Client SHALL retain the previously cached data, set isError to true, and apply the configured retry policy before marking the query as errored

### Requirement 8: Mutation and Cache Invalidation

**User Story:** As a user performing actions (archive, delete, allow, reject), I want the affected lists to update immediately and then reconcile with the server, so that the UI feels responsive.

#### Acceptance Criteria

1. WHEN a mutation fires (onMutate), THE Query_Client SHALL optimistically update the cache by removing or modifying the affected item before the network request completes
2. IF a mutation fails, THEN THE Query_Client SHALL rollback the optimistic cache update to the previous state stored in onMutate context
3. WHEN a mutation settles (onSettled, regardless of success or failure), THE Query_Client SHALL invalidate the affected queries to trigger a background refetch for reconciliation
4. WHEN a thread status mutation succeeds (archive, move-to-inbox, delete), THE Query_Client SHALL invalidate the threads list query for the affected account
5. WHEN a quarantine action succeeds (allow, reject, dismiss), THE Query_Client SHALL invalidate both the quarantine list query and the threads list query for the affected account
6. WHEN a spam signal is deleted, THE Query_Client SHALL invalidate the spam list query for the affected account
7. WHEN a mutation is in-flight, THE Query_Client SHALL expose an isPending flag keyed by resource type and resource identifier (e.g. threadId, signalId) so the UI can show a pending indicator on the specific item

### Requirement 9: Request Deduplication

**User Story:** As a developer, I want multiple components requesting the same data to share a single in-flight request, so that the app avoids redundant API calls.

#### Acceptance Criteria

1. WHILE a fetch for a given Query_Key is in-flight, THE Query_Client SHALL return the same Promise to all subsequent requests for that Query_Key
2. WHILE a fetch for a given Query_Key is in-flight, THE Query_Client SHALL not issue additional network requests for that Query_Key regardless of how many components request it
3. IF a deduplicated in-flight request fails, THEN THE Query_Client SHALL propagate the same error to all components that received the shared Promise

### Requirement 10: Garbage Collection

**User Story:** As a developer, I want the in-memory cache to persist for the full session so badges and navigation remain instant.

#### Acceptance Criteria

1. THE Query_Client SHALL set gcTime to Infinity so that no query data is evicted from memory during a session
2. THE Persister SHALL independently manage storage-level expiry via maxAge (7 days)

### Requirement 11: Retained Pinia Stores

**User Story:** As a developer, I want derived state (badge counts, sorted lists, selection state) to remain in Pinia, so that computed values and UI-only state have a clear home separate from server-cache concerns.

#### Acceptance Criteria

1. THE Pinia thread store SHALL retain selection state (selectedIds), bulk action pending flag (bulkActionPending), and computed derivations (activeCount, activeCountHasMore)
2. THE Pinia quarantine store SHALL retain actionPending state and the computed derivations (visibleCount, visibleCountHasMore)
3. THE Pinia spam store SHALL retain actionPending state and the computed derivations (blockedCount, blockedCountHasMore)
4. THE Pinia account store SHALL retain account selection, account switching, and authentication state and SHALL NOT delegate any of its state to TanStack Query
5. THE Pinia stores SHALL NOT expose loading flags, error refs, cursor refs, or pagination state for data whose fetching is managed by TanStack Query
6. WHEN a Pinia computed derivation (activeCountHasMore, visibleCountHasMore, blockedCountHasMore) depends on cursor presence, THE Pinia store SHALL read that cursor from the corresponding TanStack Infinite_Query cache rather than maintaining its own cursor ref
7. THE Pinia stores SHALL continue to expose mutation-tracking state (actionPending, bulkActionPending) for optimistic UI updates independently of TanStack Query's isPending flag

### Requirement 12: Query Key Factory

**User Story:** As a developer, I want a centralized query key factory, so that invalidation targets are consistent and typo-proof across the codebase.

#### Acceptance Criteria

1. THE Query_Key factory SHALL export a key-builder function for each resource (threads, signals, quarantine, spam, stats) that accepts accountId as a required parameter and resource-specific filter parameters as optional parameters, and returns a readonly tuple
2. THE Query_Key factory SHALL include provided filter parameters (sender, after, before, status) as ordered segments in the key, and SHALL exclude filters whose value is undefined or null so that equivalent filter combinations always produce identical keys
3. THE Query_Key factory SHALL provide a partial-key function for each resource that returns only the [resource, accountId] prefix tuple, suitable for use with Query_Client invalidateQueries prefix matching to invalidate all queries of that resource type for an account
4. THE Query_Key factory SHALL produce deterministic keys: identical inputs (same resource, accountId, and filter values) SHALL always produce the same key array, and any difference in inputs SHALL produce a different key array

### Requirement 13: WebSocket-Driven Cache Invalidation

**User Story:** As a user, I want new emails to appear in my inbox in real-time without manually refreshing, so that the app feels live.

#### Acceptance Criteria

1. WHEN the WebSocket receives a `signal` event from the backend, THE app SHALL invalidate the relevant query keys based on the signal's workflow (threads for inbox signals, quarantine for quarantine signals, spam for blocked signals)
2. THE WebSocket handler SHALL call queryClient.invalidateQueries with the partial key for the affected resource and accountId
3. IF the WebSocket connection drops, THE app SHALL NOT fall back to polling — standard stale triggers (mount, focus, reconnect) provide eventual consistency
4. THE WebSocket invalidation handler SHALL NOT refetch queries that have no active observers — invalidation marks them stale for next observation

### Requirement 14: Global Error Logging

**User Story:** As a developer, I want all query and mutation failures to be logged centrally, so that errors are visible in production without per-component wiring.

#### Acceptance Criteria

1. THE QueryCache SHALL be configured with an onError callback that calls logger.error with the query key, error object, and the query's state (failureCount, status)
2. THE MutationCache SHALL be configured with an onError callback that calls logger.error with the mutation key (or variables), error object, and failure context
3. THE global error handlers SHALL fire after all retries are exhausted — not on intermediate retry failures
