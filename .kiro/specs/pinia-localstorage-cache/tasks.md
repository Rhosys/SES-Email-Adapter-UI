# Implementation Plan: Pinia localStorage Cache Layer

## Overview

14 tasks implementing the persistent store Pinia plugin and migrating all account-scoped stores to the `_byAccount` pattern with automatic localStorage persistence. Tasks are ordered by dependency — plugin first, then store migrations, then merge logic, then cleanup.

## Tasks

- [x] 1. Create persistent store plugin (`src/plugins/persistent-store.ts`) — PersistOptions interface, module augmentation, persistentStorePlugin function with hydration on store creation, auto-persist via $subscribe, readFromLocalStorage/writeToLocalStorage with error handling + logger.warn(), removeAllForAccount for key cleanup. Key format: `ses:v{VERSION}:{accountId}:{storeId}`. Register in main.ts. **Requirements: R1, R8, R9**
- [x] 2. Refactor arcs store — split cursors from data. Change _byAccount from Record<string, ArcPageState> to Record<string, Arc[]>, add separate _cursors ref, update fetchArcs/fetchMoreArcs/nextCursor computed/optimistic mutations. Add persist option with active-only filter. **Requirements: R2, R6**
- [x] 3. Convert arcs derived counts to computed — replace activeCount/activeCountHasMore refs with computed derived from _byAccount and _cursors. Remove fetchActiveCount() and all call sites. **Requirements: R7.7**
- [x] 4. Add getArc/getArcAsync to arcs store — getArc returns from _byAccount + fires background refresh, getArcAsync awaits if not cached. Background refresh upserts into _byAccount (plugin auto-persists). **Requirements: R12**
- [x] 5. Migrate signals store to _byAccount — remove arc ref, replace flat items with _byAccount Record<string, Signal[]>, add items computed, update fetchAll/fetchMore/reset, add persist option (no filter). **Requirements: R3, R5, R7.3**
- [x] 6. Update ArcDetailView to use arcs store for arc metadata — replace signalsStore.arc with arcsStore.getArc/getArcAsync, show loading if not in store (direct link). **Requirements: R12.4**
- [x] 7. Migrate templates store to _byAccount — change flat items to _byAccount Record<string, EmailTemplate[]>, add items computed, update all methods, add persist option. **Requirements: R7.3**
- [x] 8. Migrate rules store to _byAccount — change flat items to _byAccount Record<string, Rule[]>, add items computed, update all methods, add persist option. **Requirements: R7.3**
- [x] 9. Add persist option to existing _byAccount stores — add persist config to labels, views, and stats stores. **Requirements: R2, R7.6**
- [x] 10. Add persist to quarantine store + split cursors — separate _byAccount shape from cursors, convert visibleCount/visibleCountHasMore to computed, remove fetchVisibleCount, add persist option. **Requirements: R10, R7.7**
- [x] 11. Add merge-on-revalidate to arcs store — merge fresh API response with cached list (remove stale, add new, update existing) instead of replacing. Show loading only if no cache. Log warning on fetch failure with cache. **Requirements: R4.3, R4.4**
- [x] 12. Add merge-on-revalidate to signals store — since signals are immutable, fetch only newer than latest cached createdAt and prepend. Show loading only if no cache. **Requirements: R5.2, R5.4**
- [x] 13. Add merge-on-revalidate to quarantine store — merge fresh with cached (same pattern as arcs). Show loading only if no cache. **Requirements: R10.5**
- [x] 14. Add revoked-account cache cleanup — in account.ts fetchAccount(), scan localStorage for orphaned accountIds not in API response, call removeAllForAccount, log via logger.info(). **Requirements: R11**

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "5", "7", "8", "9", "14"] },
    { "id": 2, "tasks": ["3", "4", "10"] },
    { "id": 3, "tasks": ["6", "11", "12", "13"] }
  ]
}
```

Task 1 (plugin) is the foundation. Wave 2 tasks can proceed in parallel after task 1. Wave 3 requires wave 2 store migrations. Wave 4 (merge logic + view update) requires wave 3.

## Notes

- The plugin auto-persists on every `$subscribe` firing — stores never import or call persistence functions directly
- The `filter` option on arcs store ensures only active arcs reach localStorage regardless of what the in-memory store holds
- Cursors are ephemeral (separate ref) and never persisted — stale cursors would be invalid after server-side data changes
- Signals store uses `Signal[]` directly since each Signal already carries its own `arcId` field
