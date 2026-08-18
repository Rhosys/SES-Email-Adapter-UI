import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Signal, CreateDraftSignalBody } from '@/types/server'

type InfiniteSignalData = {
  pages: Array<{ signals: Signal[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

export function useSignalListQuery(threadId: () => string | undefined) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useInfiniteQuery({
    queryKey: computed(() => queryKeys.signals.byThread(accountId.value!, threadId()!)),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listSignals(accountId.value!, threadId()!, { cursor: pageParam, limit: 50 })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value && !!threadId()),
    persister: undefined,
  })

  const signals = computed<Signal[]>(() =>
    query.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  const hasMore = computed(() => query.hasNextPage?.value ?? false)

  const latestSignal = computed<Signal | undefined>(() => {
    const all = signals.value
    if (all.length === 0) return undefined
    return all.reduce((latest, s) =>
      s.createdAt > latest.createdAt ? s : latest,
    )
  })

  return { query, signals, hasMore, latestSignal }
}

export function useCreateDraft() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async ({ threadId, body }: { threadId: string; body: CreateDraftSignalBody }) =>
      unwrap(await api.createDraftSignal(accountStore.accountId!, threadId, body)),
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
      const key = queryKeys.signals.byThread(accountId, threadId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<InfiniteSignalData>(key)
      queryClient.setQueryData<InfiniteSignalData>(key, (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            signals: page.signals.filter((s) => s.signalId !== signalId),
          })),
        }
      })
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous)
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
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
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
    onMutate: async ({ threadId, signalId, response }) => {
      const accountId = accountStore.accountId!
      const key = queryKeys.signals.byThread(accountId, threadId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<InfiniteSignalData>(key)
      // Optimistic update: mark the calendar event signal's attendee rsvpStatus
      queryClient.setQueryData<InfiniteSignalData>(key, (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            signals: page.signals.map((s) => {
              if (s.signalId !== signalId) return s
              if (s.type !== 'calendar_event') return s
              return {
                ...s,
                data: {
                  ...s.data,
                  attendees: s.data.attendees.map((a) => ({ ...a, rsvpStatus: response })),
                },
              }
            }),
          })),
        }
      })
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous)
      }
    },
    onSettled: (_data, _err, { threadId }) => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, threadId) })
    },
  })
}

export function usePrefetchThreadSignals() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  async function prefetch(threads: Array<{ threadId: string; lastSignalAt: string }>) {
    const accountId = accountStore.accountId
    if (!accountId) return
    await Promise.all(
      threads.map((t) =>
        queryClient.prefetchInfiniteQuery({
          queryKey: queryKeys.signals.byThread(accountId, t.threadId),
          queryFn: async () =>
            unwrap(await api.listSignals(accountId, t.threadId, { limit: 50 })),
          initialPageParam: undefined as string | undefined,
        }),
      ),
    )
  }

  return { prefetch }
}
