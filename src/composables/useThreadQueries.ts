import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Thread, ThreadStatus } from '@/types/server'

export function useThreadListQuery(status: () => ThreadStatus | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useInfiniteQuery({
    queryKey: computed(() => queryKeys.threads.list(accountId.value!, status())),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listThreads(accountId.value!, {
        status: status(),
        cursor: pageParam,
        limit: 50,
      })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
    persister: undefined,
  })

  const threads = computed<Thread[]>(() =>
    query.data.value?.pages.flatMap(p => p.threads) ?? [],
  )

  const activeCount = computed(() => threads.value.length)
  const hasMore = computed(() => query.hasNextPage?.value ?? false)

  return { query, threads, activeCount, hasMore }
}

export function useThreadDetailQuery(threadId: () => string | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const detailQuery = useQuery({
    queryKey: computed(() => queryKeys.threads.detail(accountId.value!, threadId()!)),
    queryFn: async () =>
      unwrap(await api.getThread(accountId.value!, threadId()!)),
    enabled: computed(() => !!accountId.value && !!threadId()),
    persister: undefined,
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
