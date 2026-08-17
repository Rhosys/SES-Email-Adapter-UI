import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import { isInboundEmailSignal } from '@/lib/signal-guards'
import { DateTime } from 'luxon'
import type { Signal, CreateDraftSignalBody } from '@/types/server'

const PAGE_SIZE = 50

function byChronologicalDesc(a: Signal, b: Signal): number {
  const aMs = DateTime.fromISO(isInboundEmailSignal(a) ? a.data.receivedAt : a.createdAt).toMillis()
  const bMs = DateTime.fromISO(isInboundEmailSignal(b) ? b.data.receivedAt : b.createdAt).toMillis()
  return bMs - aMs
}

type InfiniteSignalData = {
  pages: Array<{ signals: Signal[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

export function useSignalListQuery(threadId: () => string | null | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useInfiniteQuery({
    queryKey: computed(() => queryKeys.signals.byThread(accountId.value!, threadId()!)),
    queryFn: async ({ pageParam }) => {
      const result = await api.listSignals(accountId.value!, threadId()!, {
        cursor: pageParam,
        limit: PAGE_SIZE,
      })
      return unwrap(result)
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value && !!threadId()),
  })

  const signals = computed<Signal[]>(() => {
    const all = query.data.value?.pages.flatMap(p => p.signals) ?? []
    return [...all].sort(byChronologicalDesc)
  })

  const hasMore = computed(() => query.hasNextPage?.value ?? false)
  const latestSignal = computed(() => signals.value[0] ?? null)

  return { query, signals, hasMore, latestSignal }
}

/**
 * Fetches signals for multiple threads at once — used by the Drafts page to
 * populate the query cache for recently-active threads. Skips threads whose
 * cache is already fresh (latest cached signal covers lastSignalAt).
 */
export function usePrefetchThreadSignals() {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()

  async function prefetch(threads: Array<{ threadId: string; lastSignalAt: string }>) {
    const accountId = accountStore.accountId
    if (!accountId) return

    const staleThreads = threads.filter(({ threadId, lastSignalAt }) => {
      const data = queryClient.getQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
      )
      if (!data?.pages?.[0]?.signals.length) return true
      const newestCached = data.pages[0].signals[0]!
      return new Date(newestCached.createdAt).getTime() < new Date(lastSignalAt).getTime()
    })

    if (staleThreads.length === 0) return

    await Promise.all(
      staleThreads.map(async ({ threadId }) => {
        const result = await api.listSignals(accountId, threadId, { limit: PAGE_SIZE })
        if (result.isOk()) {
          queryClient.setQueryData(
            queryKeys.signals.byThread(accountId, threadId),
            {
              pages: [result.value],
              pageParams: [undefined],
            },
          )
        }
      }),
    )
  }

  return { prefetch }
}

/**
 * Returns all signals across every thread currently cached in the query client.
 * Used for cross-thread derivations (drafts indicator, pending_send badges).
 */
export function useAllCachedSignals() {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()

  function getAll(): Signal[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const queries = queryClient.getQueriesData<InfiniteSignalData>({
      queryKey: queryKeys.signals.all(accountId),
    })
    return queries.flatMap(([, data]) => data?.pages.flatMap(p => p.signals) ?? [])
  }

  return { getAll }
}

export function useCreateDraft() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, body }: { threadId: string; body: CreateDraftSignalBody }) =>
      unwrap(await api.createDraftSignal(accountStore.accountId!, threadId, body)),
    onSuccess: (newSignal, { threadId }) => {
      const accountId = accountStore.accountId!
      // Optimistically insert the new draft at the front of the signal list
      queryClient.setQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
        (old) => {
          if (!old?.pages) return old
          const firstPage = old.pages[0]!
          return {
            ...old,
            pages: [
              { ...firstPage, signals: [newSignal, ...firstPage.signals] },
              ...old.pages.slice(1),
            ],
          }
        },
      )
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
    },
  })
}

export function useDeleteDraft() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, signalId }: { threadId: string; signalId: string }) =>
      unwrap(await api.deleteDraftSignal(accountStore.accountId!, threadId, signalId)),
    onMutate: async ({ threadId, signalId }) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
      const previous = queryClient.getQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
      )
      queryClient.setQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
        (old) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              signals: page.signals.filter((s) => s.signalId !== signalId),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, { threadId }, context) => {
      if (context?.previous) {
        const accountId = accountStore.accountId!
        queryClient.setQueryData(
          queryKeys.signals.byThread(accountId, threadId),
          context.previous,
        )
      }
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
    },
  })
}

export function useSendSignal() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, signalId }: { threadId: string; signalId: string }) =>
      unwrap(await api.sendSignal(accountStore.accountId!, threadId, signalId)),
    onSuccess: (updatedSignal, { threadId }) => {
      const accountId = accountStore.accountId!
      // Replace the draft with the sent signal in the cache
      queryClient.setQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
        (old) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              signals: page.signals.map((s) =>
                s.signalId === updatedSignal.signalId ? updatedSignal : s,
              ),
            })),
          }
        },
      )
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, threadId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
    },
  })
}

export function useRsvpSignal() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, signalId, response }: { threadId: string; signalId: string; response: 'accepted' | 'declined' | 'tentative' }) =>
      unwrap(await api.rsvpSignal(accountStore.accountId!, threadId, signalId, response)),
    onSuccess: (updatedSignal, { threadId }) => {
      const accountId = accountStore.accountId!
      queryClient.setQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(accountId, threadId),
        (old) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              signals: page.signals.map((s) =>
                s.signalId === updatedSignal.signalId ? updatedSignal : s,
              ),
            })),
          }
        },
      )
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
    },
  })
}

/**
 * Updates a single signal in the query cache — used by components that patch
 * signals directly (e.g. autosave, reprocess) and need the cache to reflect
 * the change without a full refetch.
 */
export function useUpdateSignalCache() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  function updateSignal(threadId: string, signal: Signal) {
    const accountId = accountStore.accountId
    if (!accountId) return
    queryClient.setQueryData<InfiniteSignalData>(
      queryKeys.signals.byThread(accountId, threadId),
      (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            signals: page.signals.map((s) =>
              s.signalId === signal.signalId ? signal : s,
            ),
          })),
        }
      },
    )
  }

  function removeSignal(threadId: string, signalId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return
    queryClient.setQueryData<InfiniteSignalData>(
      queryKeys.signals.byThread(accountId, threadId),
      (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            signals: page.signals.filter((s) => s.signalId !== signalId),
          })),
        }
      },
    )
  }

  return { updateSignal, removeSignal }
}
