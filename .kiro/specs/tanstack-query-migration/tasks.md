# Implementation Plan: TanStack Query Migration

## Overview

Migrate the email-catcher site's data fetching layer from hand-rolled Pinia stores to @tanstack/vue-query v5. Executed incrementally — one store at a time — with `npm run check` gating each step.

## Tasks

- [x] 1. Write regression component tests for store-backed views
  - [x] 1.1 Write component tests for SpamView — loading skeleton, data render, filter change refetch, load more pagination, delete with optimistic removal, error state banner, rollback on failed mutation. Mock at the api layer boundary.
    - _Requirements: 7, 8, 11_
  - [x] 1.2 Write component tests for QuarantineView — loading skeleton, data render, allow/reject/dismiss with optimistic removal, filter change refetch, error state banner.
    - _Requirements: 7, 8, 11_
  - [x] 1.3 Write component tests for InboxView — loading skeleton, tab switch, archive/move with optimistic update, bulk actions, load more pagination, refresh, error state.
    - _Requirements: 7, 8, 11_
  - [x] 1.4 Write component tests for ThreadDetailView — signal list loading, pagination, draft create, send, RSVP action.
    - _Requirements: 7, 8, 11_
  - [x] 1.5 Write component tests for StatsWidget (empty → data), RulesView (loading → CRUD), LabelsView (CRUD), TemplatesView (CRUD), ResourcesView (complete/dismiss).
    - _Requirements: 7, 8, 11_

- [x] 2. Install dependencies and create foundation files
  - [x] 2.1 Install @tanstack/vue-query, @tanstack/query-persist-client-core, @tanstack/query-broadcast-client-experimental, idb-keyval. Create src/lib/queryClient.ts with QueryClient instantiation (staleTime 5000, gcTime Infinity, retry function, global error handlers, persister, broadcastQueryClient).
    - _Requirements: 1, 2, 10, 14_
  - [x] 2.2 Create src/lib/queryKeys.ts (typed query key factory for all resources), src/lib/queryRetry.ts (shouldRetry function: skip 4xx, retry 5xx/network up to 3), src/lib/queryFns.ts (unwrap helper converting Result → throw).
    - _Requirements: 1, 12_
  - [x] 2.3 Register VueQueryPlugin in main.ts alongside Pinia. Verify `npm run check` passes.
    - _Requirements: 1, 2_

- [x] 3. Migrate spam store
  - [x] 3.1 Create src/composables/useSpamQueries.ts — useSpamQuery (two useInfiniteQuery for hidden/reject) and useDeleteSpamSignal mutation with optimistic removal + rollback + onSettled invalidation.
    - _Requirements: 1, 5, 6, 8, 9, 12_
  - [x] 3.2 Gut stores/spam.ts to actionPending only (remove fetch methods, loading/error/cursor state, persist options). Update SpamView.vue to use useSpamQuery composable. Update sidebar badge to derive count from query data.
    - _Requirements: 7, 8, 11_
  - [x] 3.3 Run `npm run check`. Verify regression tests from task 1 still pass.
    - _Requirements: 7, 11_

- [x] 4. Migrate quarantine store
  - [x] 4.1 Create src/composables/useQuarantineQueries.ts — useInfiniteQuery + allow/reject/dismiss mutations with optimistic rollback + cross-invalidation of threads query.
    - _Requirements: 1, 5, 6, 8, 9, 12_
  - [x] 4.2 Gut stores/quarantine.ts to actionPending only. Update QuarantineView.vue to use useQuarantineQueries composable. Update sidebar badge.
    - _Requirements: 7, 8, 11_
  - [x] 4.3 Run `npm run check`. Verify regression tests still pass.
    - _Requirements: 7, 11_

- [x] 5. Migrate threads store
  - [x] 5.1 Create src/composables/useThreadQueries.ts — useInfiniteQuery by status + thread detail useQuery + archive/move/delete/label/snooze/unsubscribe mutations with optimistic updates.
    - _Requirements: 1, 5, 6, 8, 9, 12_
  - [x] 5.2 Gut stores/threads.ts to selection state only (selectedIds, bulkActionPending). Update InboxView.vue and ThreadDetailView.vue to use useThreadQueries composable.
    - _Requirements: 7, 8, 11_
  - [x] 5.3 Run `npm run check`. Verify regression tests still pass.
    - _Requirements: 7, 11_

- [x] 6. Migrate signals store
  - [x] 6.1 Create src/composables/useSignalQueries.ts — useInfiniteQuery by threadId + createDraft/deleteDraft/sendSignal/rsvp mutations.
    - _Requirements: 1, 5, 6, 8, 9, 12_
  - [x] 6.2 Gut stores/signals.ts to currentThreadId only. Update ThreadDetailView.vue signal list and DraftsView.vue.
    - _Requirements: 7, 8, 11_
  - [x] 6.3 Run `npm run check`. Verify regression tests still pass.
    - _Requirements: 7, 11_

- [x] 7. Migrate stats store
  - [x] 7.1 Create src/composables/useStatsQuery.ts — useQuery by accountId.
    - _Requirements: 1, 5, 9, 12_
  - [x] 7.2 Delete stores/stats.ts entirely. Update StatsView.vue and StatsWidget.vue to use useStatsQuery composable. Run `npm run check`.
    - _Requirements: 7_

- [x] 8. Migrate rules store
  - [x] 8.1 Create src/composables/useRulesQueries.ts — useQuery + CRUD/reorder mutations.
    - _Requirements: 1, 5, 8, 9, 12_
  - [x] 8.2 Gut stores/rules.ts to savePending flag only. Update RulesView.vue and RuleEditorView.vue. Run `npm run check`.
    - _Requirements: 7, 8_

- [x] 9. Migrate labels, views, templates stores
  - [x] 9.1 Create src/composables/useLabelsQueries.ts, src/composables/useViewsQueries.ts, src/composables/useTemplatesQueries.ts composables.
    - _Requirements: 1, 5, 8, 9, 12_
  - [x] 9.2 Delete stores/labels.ts, stores/views.ts, stores/templates.ts. Update LabelsView.vue and TemplatesView.vue. Run `npm run check`.
    - _Requirements: 7, 8_

- [x] 10. Migrate resources and senderIdentities stores
  - [x] 10.1 Create src/composables/useResourceQueries.ts and src/composables/useSenderIdentitiesQuery.ts composables.
    - _Requirements: 1, 5, 8, 9, 12_
  - [x] 10.2 Delete stores/resources.ts and stores/senderIdentities.ts. Update ResourcesView.vue and draft composer. Run `npm run check`.
    - _Requirements: 7, 8_

- [x] 11. Wire realtime (WebSocket) to invalidate via queryClient
  - [x] 11.1 Update useRealtime.ts — replace store method calls with queryClient.invalidateQueries() on signal:created and thread:updated events using queryKeys partial keys.
    - _Requirements: 13_
  - [x] 11.2 Run `npm run check`. Verify no regressions.
    - _Requirements: 13_

- [x] 12. Remove startup fetch chain and persistent-store plugin
  - [x] 12.1 Delete plugins/persistent-store.ts. Remove accountStore.waitForFetch().then() waterfall and visibilitychange listener from main.ts. Remove all persist options from remaining stores.
    - _Requirements: 2, 4, 10, 11_
  - [x] 12.2 Run `npm run check`. Verify cold start works (IndexedDB persister takes over).
    - _Requirements: 2, 4, 10, 11_

- [x] 13. Final cleanup and verification
  - [x] 13.1 Remove dead imports across all modified files. Run `npm run check` + full regression test suite. Verify spam filter isolation (original bug), cold start from IndexedDB, multi-tab sync, window-focus refetch.
    - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2"] },
    { "id": 8, "tasks": ["4.3"] },
    { "id": 9, "tasks": ["5.1"] },
    { "id": 10, "tasks": ["5.2"] },
    { "id": 11, "tasks": ["5.3"] },
    { "id": 12, "tasks": ["6.1"] },
    { "id": 13, "tasks": ["6.2"] },
    { "id": 14, "tasks": ["6.3"] },
    { "id": 15, "tasks": ["7.1", "8.1", "9.1", "10.1"] },
    { "id": 16, "tasks": ["7.2", "8.2", "9.2", "10.2"] },
    { "id": 17, "tasks": ["11.1"] },
    { "id": 18, "tasks": ["11.2"] },
    { "id": 19, "tasks": ["12.1"] },
    { "id": 20, "tasks": ["12.2"] },
    { "id": 21, "tasks": ["13.1"] }
  ]
}
```

Tasks 1 (regression tests) and 2 (foundation) are sequential prerequisites. Store migrations 3-6 are sequential (cross-store invalidation dependencies). Tasks 7-10 (stats, rules, labels/views/templates, resources) can be parallelized since they don't cross-reference each other. Tasks 11-13 (realtime, cleanup, final verification) are sequential and depend on all store migrations completing.

## Notes

- Each task ends with `npm run check` — the build gate catches type errors from partially migrated stores.
- The account store is deliberately NOT migrated — it manages auth state and session hydration which are outside TanStack Query's domain.
- The drafts store has no own data — it derives from signals. After task 6, the drafts store either reads from the signals query cache or is deleted.
