import { computed } from 'vue'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { BlockedSignal } from '@/types/server'

export interface SpamFilters {
  sender: string
  after: string
  before: string
}

export function useSpamQuery(filters: () => SpamFilters) {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const hiddenQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.spam.list(accountId.value!, filters()), 'hidden']),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listBlockedSignals(accountId.value!, 'block_hidden', {
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

  const rejectQuery = useInfiniteQuery({
    queryKey: computed(() => [...queryKeys.spam.list(accountId.value!, filters()), 'reject']),
    queryFn: async ({ pageParam }) =>
      unwrap(await api.listBlockedSignals(accountId.value!, 'block_reject', {
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

  const blockHidden = computed<BlockedSignal[]>(() =>
    hiddenQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  const blockReject = computed<BlockedSignal[]>(() =>
    rejectQuery.data.value?.pages.flatMap(p => p.signals) ?? [],
  )

  return { hiddenQuery, rejectQuery, blockHidden, blockReject }
}

export function useDeleteSpamSignal() {
  const queryClient = useQueryClient()
  const accountStore = useAccountStore()

  return useMutation({
    mutationFn: async (signalId: string) =>
      unwrap(await api.deleteSignal(accountStore.accountId!, signalId)),
    onMutate: async (signalId) => {
      const accountId = accountStore.accountId!
      await queryClient.cancelQueries({ queryKey: queryKeys.spam.all(accountId) })
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.spam.all(accountId) })
      queryClient.setQueriesData(
        { queryKey: queryKeys.spam.all(accountId) },
        (old: unknown) => {
          const data = old as { pages?: Array<{ signals: BlockedSignal[]; pagination: { cursor: string | null } }> } | undefined
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.spam.all(accountId) })
    },
  })
}
