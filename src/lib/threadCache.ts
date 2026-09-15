import type { QueryClient } from '@tanstack/vue-query'
import { queryKeys } from '@/lib/queryKeys'
import type { Thread } from '@/types/server'

type ThreadListPage = { threads: Thread[]; pagination: { cursor: string | null } }
type ThreadListData = { pages: ThreadListPage[]; pageParams: Array<string | undefined> }

function isThreadListData(data: unknown): data is ThreadListData {
  return !!data && typeof data === 'object' && Array.isArray((data as ThreadListData).pages)
}

/**
 * Apply a known field change to one thread's row everywhere it's cached — its detail
 * query and every cached list page it appears in — without invalidating/refetching.
 */
export function patchThreadCache(
  queryClient: QueryClient,
  accountId: string,
  threadId: string,
  patch: Partial<Thread> | ((thread: Thread) => Thread),
): void {
  const apply = (t: Thread) => (typeof patch === 'function' ? patch(t) : { ...t, ...patch })

  queryClient.setQueryData<Thread>(queryKeys.threads.detail(accountId, threadId), (old) =>
    old ? apply(old) : old,
  )

  for (const [key, data] of queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })) {
    if (!isThreadListData(data)) continue
    queryClient.setQueryData(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        threads: page.threads.map((t) => (t.threadId === threadId ? apply(t) : t)),
      })),
    })
  }
}

/**
 * Remove one thread's row from every cached list page (e.g. it moved out of the
 * status this list is scoped to) without invalidating/refetching.
 */
export function removeThreadFromLists(queryClient: QueryClient, accountId: string, threadId: string): void {
  for (const [key, data] of queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })) {
    if (!isThreadListData(data)) continue
    queryClient.setQueryData(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        threads: page.threads.filter((t) => t.threadId !== threadId),
      })),
    })
  }
}

/**
 * Seed a full thread object into its detail cache and into every cached list page whose
 * status filter it matches — inserting it at the top of the first page if it isn't
 * already present there. Used when we fetched/received the authoritative Thread and want
 * to reflect it immediately, instead of invalidating the whole list.
 */
export function upsertThreadCache(queryClient: QueryClient, accountId: string, thread: Thread): void {
  queryClient.setQueryData(queryKeys.threads.detail(accountId, thread.threadId), thread)

  for (const [key, data] of queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })) {
    if (!isThreadListData(data)) continue
    const statusFilter = (key[2] as { status?: string } | undefined)?.status
    if (statusFilter && statusFilter !== thread.status) {
      // Thread no longer belongs in this status-scoped list — drop it if present.
      queryClient.setQueryData(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          threads: page.threads.filter((t) => t.threadId !== thread.threadId),
        })),
      })
      continue
    }

    const alreadyPresent = data.pages.some((page) => page.threads.some((t) => t.threadId === thread.threadId))
    const pages = alreadyPresent
      ? data.pages.map((page) => ({
          ...page,
          threads: page.threads.map((t) => (t.threadId === thread.threadId ? thread : t)),
        }))
      : data.pages.map((page, i) => (i === 0 ? { ...page, threads: [thread, ...page.threads] } : page))
    queryClient.setQueryData(key, { ...data, pages })
  }
}
