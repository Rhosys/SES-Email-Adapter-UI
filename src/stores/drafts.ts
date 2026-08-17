import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Signal, Thread } from '@/types/server'

const TOP_THREAD_LIMIT = 30
const PAGE_SIZE = 50

function byCreatedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

type InfiniteThreadData = {
  pages: Array<{ threads: Thread[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

type InfiniteSignalData = {
  pages: Array<{ signals: Signal[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

// Drafts have no dedicated backend listing endpoint — instead this store
// derives the drafts indicator/list by scanning the signals query cache for
// every active thread. refreshTopThreads() prefetches signals for the most
// recently active threads so the Drafts page is current when visited.
export const useDraftsStore = defineStore('drafts', () => {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()

  const loading = ref(false)
  // Reactive trigger for non-reactive query cache reads in computeds
  const _cacheVersion = ref(0)

  /** Read active threads from the TanStack Query cache directly. */
  function getCachedActiveThreads(): Thread[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const data = queryClient.getQueryData<InfiniteThreadData>(queryKeys.threads.list(accountId, 'active'))
    if (!data?.pages) return []
    return data.pages.flatMap(p => p.threads).filter(t => t.status === 'active')
  }

  function getAllCachedSignals(): Signal[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const queries = queryClient.getQueriesData<InfiniteSignalData>({
      queryKey: queryKeys.signals.all(accountId),
    })
    return queries.flatMap(([, data]) => data?.pages.flatMap(p => p.signals) ?? [])
  }

  const activeThreadIds = computed(() => {
    const threads = getCachedActiveThreads()
    const ids = new Set<string>()
    for (const thread of threads) {
      ids.add(thread.threadId)
    }
    return ids
  })

  const drafts = computed<Signal[]>(() => {
    void _cacheVersion.value // reactive dependency on cache mutations
    return getAllCachedSignals()
      .filter((s) => s.status === 'draft' && !!s.threadId && activeThreadIds.value.has(s.threadId))
      .sort(byCreatedDesc)
  })

  const draftCount = computed(() => drafts.value.length)

  async function refreshTopThreads() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    // Fetch active threads directly from API
    const result = await api.listThreads(id, { status: 'active', limit: TOP_THREAD_LIMIT })
    if (result.isErr()) {
      loading.value = false
      return
    }

    // Populate the thread list cache so getCachedActiveThreads() can read it
    queryClient.setQueryData(queryKeys.threads.list(id, 'active'), {
      pages: [{ threads: result.value.threads, pagination: result.value.pagination }],
      pageParams: [undefined],
    })

    const topThreads = result.value.threads
      .sort((a, b) => new Date(b.lastSignalAt ?? 0).getTime() - new Date(a.lastSignalAt ?? 0).getTime())
      .slice(0, TOP_THREAD_LIMIT)

    // Prefetch signals for stale threads
    const staleThreads = topThreads.filter(({ threadId, lastSignalAt, createdAt }) => {
      const data = queryClient.getQueryData<InfiniteSignalData>(
        queryKeys.signals.byThread(id, threadId),
      )
      if (!data?.pages?.[0]?.signals.length) return true
      const newestCached = data.pages[0].signals[0]!
      const threadLastSignal = lastSignalAt ?? createdAt
      return new Date(newestCached.createdAt).getTime() < new Date(threadLastSignal).getTime()
    })

    if (staleThreads.length > 0) {
      await Promise.all(
        staleThreads.map(async ({ threadId }) => {
          const signalResult = await api.listSignals(id, threadId, { limit: PAGE_SIZE })
          if (signalResult.isOk()) {
            queryClient.setQueryData(
              queryKeys.signals.byThread(id, threadId),
              { pages: [signalResult.value], pageParams: [undefined] },
            )
          }
        }),
      )
    }
    loading.value = false
    _cacheVersion.value++
  }

  function removeDraft(threadId: string, signalId: string) {
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
    _cacheVersion.value++
  }

  return {
    drafts,
    draftCount,
    loading,
    refreshTopThreads,
    removeDraft,
  }
})
