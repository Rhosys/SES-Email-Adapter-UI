import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import { upsertThreadCache } from '@/lib/threadCache'
import type { QuarantinedSignal } from '@/types/server'

export interface QuarantineFilters {
  sender: string
  after: string
  before: string
}

export function useQuarantineQuery(filters: () => QuarantineFilters) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const visibleQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.quarantine.list(accountId.value!, filters()), 'visible']),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listQuarantinedSignals(accountId.value!, 'quarantine_visible', {
        sender: filters().sender || undefined,
        after: filters().after || undefined,
        before: filters().before || undefined,
        cursor: pageParam,
        limit: 50,
      })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  const hiddenQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.quarantine.list(accountId.value!, filters()), 'hidden']),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listQuarantinedSignals(accountId.value!, 'quarantine_hidden', {
        sender: filters().sender || undefined,
        after: filters().after || undefined,
        before: filters().before || undefined,
        cursor: pageParam,
        limit: 50,
      })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.cursor ?? undefined,
    enabled: computed(() => !!accountId.value),
  })

  const quarantineVisible = computed<QuarantinedSignal[]>(() =>
    visibleQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  const quarantineHidden = computed<QuarantinedSignal[]>(() =>
    hiddenQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  return { visibleQuery, hiddenQuery, quarantineVisible, quarantineHidden }
}

type QuarantineResponseResult = { thread?: { threadId: string }; signal?: unknown } & Record<string, unknown>

function useQuarantineMutation(action: (accountId: string, signalId: string) => Promise<QuarantineResponseResult>) {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (signalId: string) => {
      return action(accountStore.accountId!, signalId)
    },
    onMutate: async (signalId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.quarantine.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.quarantine.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.quarantine.all(accountId) },
        (old: unknown) => {
          const data = old as { pages?: Array<{ signals: QuarantinedSignal[]; pagination: { cursor: string | null } }> } | undefined
          if (!data?.pages) return old
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              signals: page.signals.filter((s) => s.signalId !== signalId),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _signalId, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    // The optimistic removal above already reflects the signal leaving quarantine. When the
    // response names the thread it landed on (e.g. "allow" moves it into the active inbox),
    // fetch just that one thread and seed it into the relevant caches — no blanket refetch.
    // Best-effort only: callers (e.g. navigating to the thread on allow) key off the mutation
    // response itself, so a failure here must never reject the mutation.
    onSuccess: (result) => {
      const accountId = accountStore.accountId!
      const threadId = result.thread?.threadId
      if (!threadId) return
      Promise.resolve()
        .then(() => api.getThread(accountId, threadId))
        .then((res) => {
          if (res.isOk()) upsertThreadCache(queryClient, accountId, res.value)
        })
        .catch(() => { /* best-effort cache seed — the UI already has enough to proceed */ })
    },
  })
}

export function useAllowQuarantinedSignal() {
  return useQuarantineMutation(async (accountId, signalId) =>
    unwrap(await api.quarantineResponse(accountId, signalId, 'active')),
  )
}

export function useRejectQuarantinedSignal() {
  return useQuarantineMutation(async (accountId, signalId) =>
    unwrap(await api.quarantineResponse(accountId, signalId, 'block_reject')),
  )
}

export function useDismissQuarantinedSignal() {
  return useQuarantineMutation(async (accountId, signalId) =>
    unwrap(await api.quarantineResponse(accountId, signalId, 'dismiss')),
  )
}
