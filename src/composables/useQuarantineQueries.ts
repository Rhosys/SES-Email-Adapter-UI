import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
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
    persister: undefined,
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
    persister: undefined,
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
    onSettled: () => {
      const accountId = accountStore.accountId!
      void queryClient.invalidateQueries({ queryKey: queryKeys.quarantine.all(accountId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
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
