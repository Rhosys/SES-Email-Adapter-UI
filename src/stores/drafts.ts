import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useThreadsStore } from '@/stores/threads'
import { useSignalsStore } from '@/stores/signals'
import type { Signal } from '@/types/server'

const TOP_THREAD_LIMIT = 30

function byCreatedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

// Drafts have no dedicated backend listing endpoint — instead this store
// derives the drafts indicator/list by scanning the signals already cached
// (by useSignalsStore) for every active thread. refreshTopThreads() pulls fresh
// signals for the most recently active threads so the Drafts page is current
// when visited; everywhere else, the existing per-thread signal cache (kept up
// to date by draft create/update/send/discard) is enough.
export const useDraftsStore = defineStore('drafts', () => {
  const accountStore = useAccountStore()
  const threadsStore = useThreadsStore()
  const signalsStore = useSignalsStore()

  const loading = ref(false)

  const activeThreadIds = computed(() => {
    const ids = new Set<string>()
    for (const thread of threadsStore.items) {
      if (thread.status === 'active') ids.add(thread.threadId)
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
    // Always fetch fresh threads to get current lastSignalAt
    await threadsStore.fetchThreads(true)
    const topThreads = threadsStore.sortedItems
      .filter((a) => a.status === 'active')
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
