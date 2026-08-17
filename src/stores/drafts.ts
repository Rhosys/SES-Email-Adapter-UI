import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { useSignalsStore } from '@/stores/signals'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Signal, Thread } from '@/types/server'

const TOP_THREAD_LIMIT = 30

function byCreatedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

type InfiniteThreadData = {
  pages: Array<{ threads: Thread[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

// Drafts have no dedicated backend listing endpoint — instead this store
// derives the drafts indicator/list by scanning the signals already cached
// (by useSignalsStore) for every active thread. refreshTopThreads() pulls fresh
// signals for the most recently active threads so the Drafts page is current
// when visited; everywhere else, the existing per-thread signal cache (kept up
// to date by draft create/update/send/discard) is enough.
export const useDraftsStore = defineStore('drafts', () => {
  const accountStore = useAccountStore()
  const signalsStore = useSignalsStore()

  const loading = ref(false)

  /** Read active threads from the TanStack Query cache directly. */
  function getCachedActiveThreads(): Thread[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    const queryClient = useQueryClient()
    const data = queryClient.getQueryData<InfiniteThreadData>(queryKeys.threads.list(accountId, 'active'))
    if (!data?.pages) return []
    return data.pages.flatMap(p => p.threads).filter(t => t.status === 'active')
  }

  const activeThreadIds = computed(() => {
    const threads = getCachedActiveThreads()
    const ids = new Set<string>()
    for (const thread of threads) {
      ids.add(thread.threadId)
    }
    return ids
  })

  const drafts = computed<Signal[]>(() =>
    signalsStore.allSignals
      .filter((s) => s.status === 'draft' && !!s.threadId && activeThreadIds.value.has(s.threadId))
      .sort(byCreatedDesc),
  )

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
    const topThreads = result.value.threads
      .sort((a, b) => new Date(b.lastSignalAt ?? 0).getTime() - new Date(a.lastSignalAt ?? 0).getTime())
      .slice(0, TOP_THREAD_LIMIT)
      .map((a) => ({ threadId: a.threadId, lastSignalAt: a.lastSignalAt ?? a.createdAt }))
    await signalsStore.fetchForThreads(topThreads)
    loading.value = false
  }

  function removeDraft(threadId: string, signalId: string) {
    signalsStore.removeSignal(threadId, signalId)
  }

  return {
    drafts,
    draftCount,
    loading,
    refreshTopThreads,
    removeDraft,
  }
})
