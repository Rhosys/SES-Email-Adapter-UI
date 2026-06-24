# Requirements Document

## Introduction

Add a localStorage persistence layer to the Pinia stores in email-catcher/site so that cached arc lists, quarantine signals, and last-viewed arc signals are displayed immediately on page load while fresh data is fetched in the background (stale-while-revalidate pattern). Only active arcs are cached — all other statuses are pruned from localStorage. All caches are keyed on accountId to handle account switching correctly. The persistence layer should use an optimized Pinia plugin if one exists that handles multi-tab coordination; otherwise hand-roll the integration.

## Glossary

- **Cache_Layer**: The localStorage persistence module (Pinia plugin or hand-rolled) responsible for reading, writing, and pruning cached store state.
- **Arcs_Store**: The Pinia composition-style store (`arcs.ts`) that holds arc page state keyed by accountId in `_byAccount: Record<string, ArcPageState>`.
- **Signals_Store**: The Pinia composition-style store (`signals.ts`) that holds signals for the last-viewed arc.
- **Quarantine_Store**: The Pinia composition-style store (`quarantine.ts`) that holds quarantine signals keyed by accountId.
- **Account_Store**: The Pinia store that manages account selection, persisting accountId to sessionStorage (per-tab) and localStorage (last-used).
- **ArcPageState**: The per-account arc data structure `{ items: Arc[], nextCursor?: string }`.
- **Arc**: A materialized aggregate of related signals with a `status` field of type `ArcStatus`.
- **ArcStatus**: The union type `'active' | 'archived' | 'deleted' | 'report_violation'`.
- **Cacheable_Arc_Status**: Only `active`. All other statuses are excluded from cache.
- **Stale_While_Revalidate**: A pattern where cached data is displayed immediately on load, then merged with fresh data once a background fetch completes.
- **Logger**: The existing `@/lib/logger` singleton used for structured logging (info, warn, error).

## Requirements

### Requirement 1: Account-Keyed localStorage Namespace

**User Story:** As a user with multiple accounts, I want cached data to be isolated per account, so that switching accounts never shows stale data from a different account.

#### Acceptance Criteria

1. THE Cache_Layer SHALL key all localStorage entries using a format that includes the accountId, obtained from the Account_Store.
2. WHEN reading cached data, THE Cache_Layer SHALL only return entries whose key matches the current accountId from the Account_Store, and SHALL return undefined for keys that exist under a different accountId.
3. WHEN the accountId is not available from the Account_Store, THE Cache_Layer SHALL not read from or write to localStorage and SHALL return undefined for all read operations.
4. WHEN the accountId changes in the Account_Store, THE Cache_Layer SHALL immediately use the new accountId for all subsequent read and write operations without requiring a page reload.
5. THE Cache_Layer SHALL handle multiple tabs open simultaneously, each potentially having a different active accountId — writes from one tab SHALL NOT corrupt cache entries for a different accountId in another tab.

### Requirement 2: Persist Arc List to localStorage

**User Story:** As a user, I want my arc list to survive page reloads, so that I see content immediately instead of a loading spinner.

#### Acceptance Criteria

1. WHEN the Arcs_Store receives a successful API response that updates `_byAccount` for the current accountId, THE Cache_Layer SHALL write the arc items for that accountId to localStorage, along with a timestamp of when the write occurred.
2. THE Cache_Layer SHALL persist only arcs with a status of `active` — arcs with status `archived`, `deleted`, or `report_violation` SHALL be excluded from the persisted data.
3. THE Cache_Layer SHALL NOT persist the `nextCursor` value — only the arc items array is cached.
4. WHEN the Arcs_Store performs an optimistic removal (archive or delete), THE Cache_Layer SHALL remove the affected arc entry from the persisted array for that accountId in localStorage.
5. IF the localStorage write fails (e.g., quota exceeded or unavailable), THEN THE Cache_Layer SHALL log a warning via `logger.warn()` with the error details, and continue without interrupting the in-memory store operation.
6. WHEN the Arcs_Store reads cached data on initialisation, IF the persisted timestamp is older than 7 days, THEN THE Cache_Layer SHALL discard the stale entry and allow a fresh API fetch instead of serving expired data.

### Requirement 3: Persist Last-Viewed Arc Signals to localStorage

**User Story:** As a user, I want the signals for the last arc I viewed to load instantly on revisit, so that navigating back feels responsive.

#### Acceptance Criteria

1. WHEN the Signals_Store completes a successful `fetchAll` for an arc, THE Cache_Layer SHALL write the arc metadata and signal items to localStorage under a key derived from accountId and arcId.
2. THE Cache_Layer SHALL persist only a single arc's signals per account — the most recently viewed arc — by removing any previously cached arc entry for that accountId before writing the new one.
3. THE Cache_Layer SHALL NOT persist cursor values for signals — only the signal items and arc metadata are cached.
4. IF the localStorage write fails due to quota exceeded or unavailability, THEN THE Cache_Layer SHALL log a warning via `logger.warn()` with the error details, and continue without affecting the Signals_Store's in-memory state.
5. THE Cache_Layer SHALL persist all signal items returned by `fetchAll` without any cap or limit.

### Requirement 4: Hydrate Arcs Store from Cache on Load

**User Story:** As a user, I want cached arcs to appear immediately on page load, so that I can start reading without waiting for the network.

#### Acceptance Criteria

1. WHEN the Arcs_Store initializes and an accountId is available, THE Arcs_Store SHALL read cached arc data from localStorage and populate `_byAccount` for that accountId.
2. WHEN hydration from cache completes, THE Arcs_Store SHALL initiate a background fetch to retrieve fresh data from the API.
3. WHEN the background fetch completes successfully, THE Arcs_Store SHALL merge the fresh data into the existing cached list — removing arcs no longer present in the API response, adding new arcs not in the cache, and updating arcs that exist in both — rather than replacing the entire list (to avoid UI flash).
4. IF the background fetch fails, THEN THE Arcs_Store SHALL retain the cached data in `_byAccount` and log a warning via `logger.warn()` with the error details. No observable error property is set.
5. IF no cached data exists in localStorage for the accountId, THEN THE Arcs_Store SHALL leave `_byAccount` empty for that accountId and proceed directly to fetching from the API.
6. IF cached data in localStorage is unparseable, THEN THE Arcs_Store SHALL discard the invalid entry, leave `_byAccount` empty for that accountId, and proceed directly to fetching from the API.

### Requirement 5: Hydrate Signals Store from Cache on Load

**User Story:** As a user, I want the signals for the last-viewed arc to appear instantly when I navigate to that arc, so that the thread loads without delay.

#### Acceptance Criteria

1. WHEN the Signals_Store `fetchAll` is called for an arcId that matches the cached arcId for the current accountId, THE Signals_Store SHALL immediately populate items and arc metadata from cache before initiating the API request.
2. WHEN the API response arrives after a cache-hydrated fetch, THE Signals_Store SHALL merge fresh signals into the existing list — since signals are immutable, the fetch only needs to retrieve signals newer than the most recent cached signal's dateTime, and prepend them to the list.
3. WHEN the Signals_Store `fetchAll` is called for an arcId that does NOT match the cached arcId, THE Signals_Store SHALL not hydrate from cache, SHALL set the loading state to indicate a fetch is in progress, and SHALL await the API response before populating items.
4. IF the API response fails after the Signals_Store has hydrated from cache, THEN THE Signals_Store SHALL retain the cached data in items and arc metadata, and log a warning via `logger.warn()`.
5. IF the cache entry for the current accountId is absent or contains zero signals, THEN THE Signals_Store SHALL skip hydration and SHALL proceed with the normal loading state as if the arcId did not match.

### Requirement 6: Prune Non-Active Arcs from Cache

**User Story:** As a user, I want non-active arcs to be removed from cache, so that localStorage does not grow unbounded with stale entries.

#### Acceptance Criteria

1. WHEN writing arc data to localStorage, THE Cache_Layer SHALL exclude any arc where `status` is NOT `active` (i.e., exclude `archived`, `deleted`, and `report_violation`).
2. WHEN reading arc data from localStorage, THE Cache_Layer SHALL filter out any arc where `status` is NOT `active` before returning the data to the caller (defensive — handles data written by a prior version).
3. THE Cache_Layer SHALL NOT persist arcs with any non-active status under any code path.
4. WHEN an arc's status changes to any non-active status, THE Cache_Layer SHALL remove that arc from localStorage within the same operation that updates the status.

### Requirement 7: Cache Isolation on Account Switch

**User Story:** As a user switching accounts, I want the new account's cache to load correctly without contamination from the previous account.

#### Acceptance Criteria

1. WHEN the Account_Store executes `switchAccount`, THE application SHALL write the target accountId to sessionStorage (`ses:tabAccountId`) and localStorage (`ses:lastAccountId`) before triggering navigation to the inbox route via `window.location.assign('/')`.
2. ALL stores that hold per-account data SHALL use the `_byAccount` keying pattern (keyed on accountId). When the accountId changes, computed properties automatically return data for the new account (empty if not yet fetched/hydrated). No explicit clearing of in-memory state is required for `_byAccount`-keyed stores.
3. Stores that currently use flat refs for account-scoped data (signals, templates, rules) SHALL be migrated to the `_byAccount` pattern so they self-isolate on account switch.
4. Ephemeral UI state (selectedIds, activeTab, quarantine filters) SHALL be reset by the route navigation — the inbox route reinitializes these to defaults on mount.
5. THE Cache_Layer SHALL NOT delete localStorage entries belonging to other accounts — each account's cache remains available for when that account is selected again.
6. WHEN the application initializes, THE Cache_Layer SHALL derive the active accountId from the Account_Store and hydrate ONLY the data keyed under that accountId — never reading data from other accounts into the current session.
7. Derived counts (activeCount, activeCountHasMore, visibleCount, visibleCountHasMore) SHALL be Vue `computed()` refs derived from `_byAccount[accountId]` data, so they reactively update when the underlying data changes without manual clearing.

### Requirement 8: localStorage Size Management and Plugin Architecture

**User Story:** As a developer, I want the cache to handle localStorage quota limits gracefully and work across multiple tabs, so that the application does not break when storage is full or when multiple tabs are active.

#### Acceptance Criteria

1. THE Cache_Layer SHALL be implemented as a Pinia plugin if a suitable open-source plugin exists that supports: account-keyed namespacing, selective store persistence, and multi-tab coordination. IF no suitable plugin exists, THE Cache_Layer SHALL be implemented as a hand-rolled module.
2. IF a localStorage write throws a `QuotaExceededError`, THEN THE Cache_Layer SHALL catch the error, log a warning via `logger.warn()`, remove all localStorage entries whose keys belong to the current accountId, and continue subsequent operations without caching (no-op mode) for the remainder of the session.
3. IF localStorage is unavailable (private browsing, disabled, or SSR context), THEN THE Cache_Layer SHALL operate as a no-op for all read and write operations without throwing errors, returning `undefined` for reads and silently discarding writes.
4. THE Cache_Layer SHALL serialize data as JSON using `JSON.stringify` before writing to localStorage, and deserialize with `JSON.parse` when reading from localStorage.
5. IF `JSON.parse` throws a `SyntaxError` when reading a cached entry, THEN THE Cache_Layer SHALL remove the corrupted entry from localStorage, log a warning via `logger.warn()`, and return `undefined` to the caller.
6. WHEN the Cache_Layer initializes, THE Cache_Layer SHALL detect localStorage availability by attempting a test write and read cycle, and IF the test fails, THEN THE Cache_Layer SHALL enter no-op mode for the session.
7. THE Cache_Layer SHALL correctly handle multiple browser tabs open simultaneously — each tab may have a different active accountId, and writes from one tab SHALL NOT overwrite or corrupt cache entries belonging to a different accountId.

### Requirement 9: Cache Versioning

**User Story:** As a developer, I want to invalidate stale caches when the data schema changes, so that incompatible cached data does not cause runtime errors.

#### Acceptance Criteria

1. THE Cache_Layer SHALL include a version identifier in the localStorage key format.
2. WHEN reading a cached entry, IF the version does not match the current version constant, THEN THE Cache_Layer SHALL discard the cached data, remove the stale key from localStorage, and return `undefined` to the caller.
3. THE version identifier SHALL be a numeric integer constant defined in the Cache_Layer source code, incremented manually by the developer when the serialized data shape changes (e.g., when a field is added, removed, or renamed on the cached types).
4. WHEN the Cache_Layer version is incremented, THE Cache_Layer SHALL NOT automatically migrate data from the previous version — stale entries are discarded on next read.
5. THE version SHALL NOT include the accountId — the accountId is a separate segment in the key. The version applies globally across all accounts.

### Requirement 10: Persist Quarantine Signals to localStorage

**User Story:** As a user, I want quarantine signals to load instantly on page load, so that I can review held messages without waiting for the network.

#### Acceptance Criteria

1. WHEN the Quarantine_Store receives a successful API response that updates its per-account state, THE Cache_Layer SHALL write the quarantine visible and hidden signal items to localStorage keyed on accountId.
2. THE Cache_Layer SHALL persist a timestamp alongside the quarantine data, and discard entries older than 7 days on read.
3. WHEN the Quarantine_Store initializes and an accountId is available, THE Cache_Layer SHALL read cached quarantine data from localStorage and populate the store's per-account state.
4. AFTER hydrating from cache, THE Quarantine_Store SHALL initiate a background fetch to retrieve fresh data from the API.
5. WHEN the background fetch completes, THE Quarantine_Store SHALL merge the fresh data into the existing cached list rather than replacing it entirely (to avoid UI flash).
6. IF the localStorage write fails, THEN THE Cache_Layer SHALL log a warning via `logger.warn()` and continue without interrupting the in-memory store.

### Requirement 11: Revoked Account Cache Cleanup

**User Story:** As a user who loses access to an account, I want the cached data for that account to be cleaned up, so that localStorage does not accumulate stale data for inaccessible accounts.

#### Acceptance Criteria

1. WHEN the Account_Store fetches the list of accounts from the API and the response does NOT include a previously-cached accountId, THE Cache_Layer SHALL remove all localStorage entries keyed under that accountId.
2. THE cleanup SHALL occur during the normal account fetch on application initialization — no separate background process is required.
3. THE Cache_Layer SHALL log an info message via `logger.info()` when removing data for a revoked account, including the accountId being cleaned up.
4. IF the user regains access to the account later, THE Cache_Layer SHALL treat it as a fresh account with no cached data (normal cold-start behavior).

### Requirement 12: Arc Detail Retrieval via Arcs Store

**User Story:** As a user viewing a thread, I want the arc metadata to load instantly from the arcs store cache, so that the detail view renders without delay when navigating from the inbox.

#### Acceptance Criteria

1. THE Arcs_Store SHALL expose a `getArc(arcId)` method that returns the arc from `_byAccount[accountId].items` if present.
2. IF the arc is found in the store, THE method SHALL return it immediately AND fire a background `api.getArc()` fetch to refresh the entry in `_byAccount`.
3. IF the arc is NOT found in the store, THE method SHALL await the `api.getArc()` fetch, insert the result into `_byAccount[accountId].items`, and return it.
4. THE Signals_Store SHALL NOT hold an `arc` ref — any component needing the arc metadata SHALL read it from the Arcs_Store via `getArc(arcId)`.
5. WHEN the background refresh resolves with updated arc data, THE Arcs_Store SHALL update the arc entry in `_byAccount[accountId].items` in place, causing any computed refs consuming that arc to reactively update.
