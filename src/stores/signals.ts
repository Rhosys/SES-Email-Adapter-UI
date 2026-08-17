import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { queryKeys } from '@/lib/queryKeys'
import type { Signal } from '@/types/server'

type InfiniteSignalData = {
  pages: Array<{ signals: Signal[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

// Gutted — all fetch logic, data refs, loading/cursor state removed.
// This store is now a thin facade over the TanStack Query signal cache.
// Kept for backward compatibility with components that reference
// threadSignals(), allSignals, updateSignal(), removeSignal().
export const useSignalsStore = defineStore('signals', () => {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()

  const currentThreadId = ref<string | null>(null)

  function threadSignals(threadId: string): Signal[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const data = queryClient.getQueryData<InfiniteSignalData>(
      queryKeys.signals.byThread(accountId, threadId),
    )
    return data?.pages.flatMap(p => p.signals) ?? []
  }

  // Every signal cached for the current account, across all threads.
  const allSignals = computed<Signal[]>(() => {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const queries = queryClient.getQueriesData<InfiniteSignalData>({
      queryKey: queryKeys.signals.all(accountId),
    })
    return queries.flatMap(([, data]) => data?.pages.flatMap(p => p.signals) ?? [])
  })

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

  return {
    currentThreadId,
    allSignals,
    threadSignals,
    updateSignal,
    removeSignal,
  }
})
