import { computed, ref } from 'vue'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Thread, ThreadStatus } from '@/types/server'

type InfiniteThreadData = {
  pages: Array<{ threads: Thread[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

export function useThreadListQuery(status: () => ThreadStatus | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  // Sent as `refresh` on the query's very first fetch (covers a page load/reload) and again
  // whenever requestRefresh() runs (the inbox's Refresh button) — the backend treats a present
  // `refresh` value as a signal to wake the IMAP/JMAP IDLE listener for the account, on top of
  // whatever TanStack Query itself decides to (re)fetch. Consumed after one fetch so routine
  // refetches (pagination, window focus, mutation-triggered invalidation) don't keep re-sending it.
  const pendingRefresh = ref<string | undefined>(new Date().toISOString())

  const query = useInfiniteQuery({
    queryKey: computed(() => queryKeys.threads.list(accountId.value!, status())),
    queryFn: async ({ pageParam }) => {
      const refresh = pendingRefresh.value
      pendingRefresh.value = undefined
      return unwrap(await api.listThreads(accountId.value!, {
        status: status(),
        cursor: pageParam,
        limit: 50,
        ...(refresh ? { refresh } : {}),
      }))
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  function requestRefresh() {
    pendingRefresh.value = new Date().toISOString()
    return query.refetch()
  }

  const threads = computed<Thread[]>(() =>
    query.data.value?.pages.flatMap(p => p.threads).filter(t => {
      // Filter out sentinel/ghost threads: null lastSignalAt means signals were
      // reprocessed away; dates before Y2K are DB placeholders (epoch, etc.)
      if (!t.lastSignalAt) return false
      return new Date(t.lastSignalAt).getTime() > new Date('2000-01-01').getTime()
    }) ?? [],
  )

  const activeCount = computed(() => threads.value.length)
  const hasMore = computed(() => query.hasNextPage?.value ?? false)

  return { query, threads, activeCount, hasMore, requestRefresh }
}

export function useThreadDetailQuery(threadId: () => string | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const detailQuery = useQuery({
    queryKey: computed(() => queryKeys.threads.detail(accountId.value!, threadId()!)),
    queryFn: async () =>
      unwrap(await api.getThread(accountId.value!, threadId()!)),
    enabled: computed(() => !!accountId.value && !!threadId()),
  })

  const thread = computed(() => detailQuery.data.value)

  return { ...detailQuery, thread }
}

// Shared helper for status mutations (archive, move-to-inbox, delete)
function useThreadStatusMutation(targetStatus: ThreadStatus) {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadId: string) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { status: targetStatus })),
    onMutate: async (threadId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      // Optimistic removal from the source list
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as { pages?: Array<{ threads: Thread[]; pagination: { cursor: string | null } }> } | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.filter((t) => t.threadId !== threadId),
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

// Shared helper for bulk status mutations
function useBulkThreadStatusMutation(targetStatus: ThreadStatus) {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (threadIds: string[]) => {
      const accountId = accountStore.accountId!
      await Promise.all(
        threadIds.map((id) => api.patchThread(accountId, id, { status: targetStatus }).then(unwrap)),
      )
    },
    onMutate: async (threadIds) => {
      const accountId = accountStore.accountId!
      const idsSet = new Set(threadIds)
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as { pages?: Array<{ threads: Thread[]; pagination: { cursor: string | null } }> } | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.filter((t) => !idsSet.has(t.threadId)),
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

export function useArchiveThread() {
  return useThreadStatusMutation('archived')
}

export function useMoveToInbox() {
  return useThreadStatusMutation('active')
}

export function useDeleteThread() {
  return useThreadStatusMutation('deleted')
}

export function useBulkArchive() {
  return useBulkThreadStatusMutation('archived')
}

export function useBulkMoveToInbox() {
  return useBulkThreadStatusMutation('active')
}

export function useBulkLabel() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadIds, label, threads }: { threadIds: string[]; label: string; threads: Thread[] }) => {
      const accountId = accountStore.accountId!
      await Promise.all(
        threadIds.map((id) => {
          const existing = threads.find((t) => t.threadId === id)
          const currentLabels = existing?.labels ?? []
          const newLabels = currentLabels.includes(label) ? currentLabels : [...currentLabels, label]
          return api.patchThread(accountId, id, { labels: newLabels }).then(unwrap)
        }),
      )
    },
    onMutate: async ({ threadIds, label }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.threads.all(accountId) })
      // Optimistic update: add label to matching threads
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all(accountId) },
        (old: unknown) => {
          const data = old as { pages?: Array<{ threads: Thread[]; pagination: { cursor: string | null } }> } | undefined
          if (!data?.pages) return old
          const idsSet = new Set(threadIds)
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                idsSet.has(t.threadId) && !t.labels.includes(label)
                  ? { ...t, labels: [...t.labels, label] }
                  : t,
              ),
            })),
          }
        },
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

export function useLabelThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, labels }: { threadId: string; labels: string[] }) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { labels })),
    onMutate: async ({ threadId, labels }) => {
      const accountId = accountStore.accountId!
      const detailKey = queryKeys.threads.detail(accountId, threadId)
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousDetail = queryClient.getQueryData<Thread>(detailKey)
      if (previousDetail) {
        queryClient.setQueryData<Thread>(detailKey, { ...previousDetail, labels })
      }
      return { previousDetail, detailKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, threadId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useSnoozeThread() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, followupAt }: { threadId: string; followupAt: string }) =>
      unwrap(await api.patchThread(accountStore.accountId!, threadId, { followupAt })),
    onMutate: async ({ threadId, followupAt }) => {
      const accountId = accountStore.accountId!
      const detailKey = queryKeys.threads.detail(accountId, threadId)
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousDetail = queryClient.getQueryData<Thread>(detailKey)
      if (previousDetail) {
        queryClient.setQueryData<Thread>(detailKey, { ...previousDetail, followupAt })
      }
      return { previousDetail, detailKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, threadId) })
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
    onSettled: (_data, _err, threadId) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, threadId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function usePrefetchActiveThreads() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  async function prefetch() {
    const accountId = accountStore.accountId
    if (!accountId) return

    const pages: InfiniteThreadData['pages'] = []
    let cursor: string | undefined

    for (let i = 0; i < 3; i++) {
      const page = await unwrap(await api.listThreads(accountId, { status: 'active', limit: 50, cursor }))
      pages.push(page)
      cursor = page.pagination.cursor ?? undefined
      if (!cursor) break
    }

    queryClient.setQueryData<InfiniteThreadData>(
      queryKeys.threads.list(accountId, 'active'),
      { pages, pageParams: [undefined, ...pages.slice(0, -1).map(p => p.pagination.cursor ?? undefined)] },
    )
  }

  return { prefetch }
}
