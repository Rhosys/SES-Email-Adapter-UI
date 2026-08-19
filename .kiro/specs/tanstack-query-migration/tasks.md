# Implementation Plan: TanStack Query Migration — Remaining Gaps

## Overview

The core migration is complete (composables, queryClient, queryKeys, queryRetry, useRealtime all in place). This task list addresses the remaining gaps identified in the design document: persister maxAge mismatch, filter exclusion in query keys, and property-based tests for correctness properties 1–4.

## Tasks

- [ ] 1. Fix configuration gaps
  - [ ] 1.1 Fix persister maxAge from 30 days to 7 days in `src/lib/queryClient.ts`
    - Change `maxAge: 30 * 24 * 60 * 60 * 1000` to `maxAge: 7 * 24 * 60 * 60 * 1000`
    - _Requirements: 2.3_

  - [ ] 1.2 Fix queryKeys filter stripping in `src/lib/queryKeys.ts`
    - The `quarantine.list`, `spam.list`, and `resources.list` builders currently pass the raw filters object including `undefined`/`null` values
    - Add a `stripUndefined` helper that removes keys with `undefined` or `null` values before including filters in the key tuple
    - This ensures `{ sender: undefined }` and `{}` produce identical keys
    - _Requirements: 12.2, 12.4_

- [ ] 2. Property-based tests setup and implementation
  - [ ] 2.1 Install fast-check as a dev dependency
    - Run `npm install --save-dev fast-check`
    - _Requirements: N/A (test infrastructure)_

  - [ ]* 2.2 Write property test for retry decision correctness
    - **Property 1: Retry decision correctness**
    - **Validates: Requirements 1.3, 1.4**
    - Create `tests/unit/queryRetry.property.test.ts`
    - Generate `(failureCount ∈ [0, 10], status ∈ {0, 100–599})` → verify `shouldRetry` returns `true` only when error is network (status 0) or server (status >= 500) AND failureCount < 3; returns `false` for any 4xx regardless of failureCount
    - Minimum 100 iterations

  - [ ]* 2.3 Write property test for query key structural correctness
    - **Property 2: Query key structural correctness**
    - **Validates: Requirements 5.1, 12.1, 12.3**
    - Create `tests/unit/queryKeys.property.test.ts`
    - Generate random accountId strings and resource types → verify `.all(accountId)` returns a readonly tuple with resource name at index 0 and accountId at index 1; list and detail builders also contain accountId at index 1
    - Minimum 100 iterations

  - [ ]* 2.4 Write property test for query key determinism and filter handling
    - **Property 3: Query key determinism and filter handling**
    - **Validates: Requirements 12.2, 12.4**
    - In `tests/unit/queryKeys.property.test.ts`
    - Generate pairs of filter objects with same accountId → verify identical defined filter values produce deeply-equal keys, differing defined values produce non-equal keys, and undefined/null parameters are excluded from the key
    - Minimum 100 iterations

  - [ ]* 2.5 Write property test for cursor extraction
    - **Property 4: Cursor extraction**
    - **Validates: Requirements 6.2, 6.5**
    - Create `tests/unit/cursorExtraction.property.test.ts`
    - Extract the `getNextPageParam` function from `useThreadQueries` (or inline a reference implementation matching the same logic)
    - Generate random `{ pagination: { cursor: string | null } }` → verify returns the cursor string when non-empty, returns `undefined` when cursor is `null` or `undefined`
    - Minimum 100 iterations

- [ ] 3. Checkpoint — Ensure all tests pass
  - Run `npm run check` to verify type-check + lint + all unit tests (including new property tests) pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests complement the existing example-based `queryRetry.test.ts` — they don't replace it
- The `getNextPageParam` logic is inlined in each composable's `useInfiniteQuery` config; the property test should test the same `lastPage.pagination.cursor ?? undefined` pattern via a standalone function or by importing the composable's logic
- fast-check is appropriate for the site project (the backend's no-fast-check rule does not apply here)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "2.5"] }
  ]
}
```
