import { computed } from 'vue'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Thread, ThreadStatus } from '@/types/server'

const PAGE_SIZE = 50

// Threads with no meaningful lastSignalAt are hidden from all listings
const SIGNAL_CUTOFF = '2000-01-01T00:00:00.000Z'

function isVisible(t: Thread): boolean {
  return t.lastSignalAt != null && t.lastSignalAt > SIGNAL_CUTOFF
}

function byLastSignalDesc(a: Thread, b: Thread) {
  return new Date(b.lastSignalAt ?? 0).getTime() - new Date(a.lastSignalAt ?? 0).getTime()
}

type InfiniteThreadData = {
  pages: Array<{ threads: Thread[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

export function useThreadListQuery(status: () => ThreadStatus | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useInfiniteQuery({
    queryKey: computed(() => queryKeys.threads.list(accountId.value!, status())),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listThreads(accountId.value!, {
        status: status(),
        cursor: pageParam,
        limit: PAGE_SIZE,
      })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  const threads = computed<Thread[]>(() => {
    const all = query.data.value?.pages.flatMap(p => p.threads) ?? []
    const requestedStatus = status()
    return all
      .filter((t) => isVisible(t) && (!requestedStatus || t.status === requestedStatus))
      .sort(byLastSignalDesc)
  })

  const activeCount = computed(() => threads.value.filter(t => t.status === 'active').length)
  const hasMore = computed(() => query.hasNextPage?.value ?? false)

  return { query, threads, activeCount, hasMore }
}

export function useThreadDetailQuery(threadId: () => string | null | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.threads.detail(accountId.value!, threadId()!)),
    queryFn: async () => unwrap(await api.getThread(accountId.value!, threadId()!)),
    enabled: computed(() => !!accountId.value && !!threadId()),
  })

  return { query, thread: computed(() => query.data.value ?? null) }
}

export function useArchiveThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadId: string) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { status: 'archived' })),
    onMutate: async (threadId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                t.threadId === threadId ? { ...t, status: 'archived' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadId, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useMoveToInbox() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadId: string) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { status: 'active' })),
    onMutate: async (threadId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                t.threadId === threadId ? { ...t, status: 'active' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadId, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useDeleteThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadId: string) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { status: 'deleted' })),
    onMutate: async (threadId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                t.threadId === threadId ? { ...t, status: 'deleted' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadId, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useLabelThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, labels }: { threadId: string; labels: string[] }) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { labels })),
    onMutate: async ({ threadId, labels }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                t.threadId === threadId ? { ...t, labels } : t,
              ),
            })),
          }
        },
      )
      // Also update the detail cache
      queryClient.setQueryData(
        queryKeys.threads.detail(accountId, threadId),
        (old: Thread | undefined) => old ? { ...old, labels } : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useSnoozeThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, followupAt }: { threadId: string; followupAt: string }) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { status: 'archived', followupAt })),
    // No optimistic update — snooze can be rejected by the server (invalid followupAt)
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useUnsubscribeThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadId: string) =>
      unwrap(await api.unsubscribeThread(accountStore.accountId!, threadId)),
    onMutate: async (threadId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                t.threadId === threadId ? { ...t, status: 'archived' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadId, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useBulkArchive() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadIds: string[]) => {
      const accountId = accountStore.accountId!
      const results = await Promise.all(
        threadIds.map((id) => api.patchThread(accountId, id, { status: 'archived' })),
      )
      const failed = results.filter((r) => r.isErr())
      if (failed.length > 0) throw new Error(`Failed to archive ${failed.length} thread(s)`)
      return results.map((r) => r._unsafeUnwrap())
    },
    onMutate: async (threadIds) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          const ids = new Set(threadIds)
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                ids.has(t.threadId) ? { ...t, status: 'archived' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadIds, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useBulkMoveToInbox() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadIds: string[]) => {
      const accountId = accountStore.accountId!
      const results = await Promise.all(
        threadIds.map((id) => api.patchThread(accountId, id, { status: 'active' })),
      )
      const failed = results.filter((r) => r.isErr())
      if (failed.length > 0) throw new Error(`Failed to move ${failed.length} thread(s) to inbox`)
      return results.map((r) => r._unsafeUnwrap())
    },
    onMutate: async (threadIds) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          const ids = new Set(threadIds)
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                ids.has(t.threadId) ? { ...t, status: 'active' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadIds, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useBulkDelete() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadIds: string[]) => {
      const accountId = accountStore.accountId!
      const results = await Promise.all(
        threadIds.map((id) => api.patchThread(accountId, id, { status: 'deleted' })),
      )
      const failed = results.filter((r) => r.isErr())
      if (failed.length > 0) throw new Error(`Failed to delete ${failed.length} thread(s)`)
      return results.map((r) => r._unsafeUnwrap())
    },
    onMutate: async (threadIds) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as InfiniteThreadData | undefined
          if (!data?.pages) return old
          const ids = new Set(threadIds)
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                ids.has(t.threadId) ? { ...t, status: 'deleted' as ThreadStatus } : t,
              ),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _threadIds, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useBulkLabel() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadIds, label, threads }: { threadIds: string[]; label: string; threads: Thread[] }) => {
      const accountId = accountStore.accountId!
      const results = await Promise.all(
        threadIds.map((id) => {
          const thread = threads.find((t) => t.threadId === id)
          const labels = thread ? [...new Set([...thread.labels, label])] : [label]
          return api.patchThread(accountId, id, { labels })
        }),
      )
      const failed = results.filter((r) => r.isErr())
      if (failed.length > 0) throw new Error(`Failed to label ${failed.length} thread(s)`)
      return results.map((r) => r._unsafeUnwrap())
    },
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}
