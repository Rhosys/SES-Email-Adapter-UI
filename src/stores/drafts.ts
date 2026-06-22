import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useSignalsStore } from '@/stores/signals'
import type { Signal } from '@/types/server'

const TOP_ARC_LIMIT = 30

function byCreatedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

// Drafts have no dedicated backend listing endpoint — instead this store
// derives the drafts indicator/list by scanning the signals already cached
// (by useSignalsStore) for every active arc. refreshTopArcs() pulls fresh
// signals for the most recently active arcs so the Drafts page is current
// when visited; everywhere else, the existing per-arc signal cache (kept up
// to date by draft create/update/send/discard) is enough.
export const useDraftsStore = defineStore('drafts', () => {
  const accountStore = useAccountStore()
  const arcsStore = useArcsStore()
  const signalsStore = useSignalsStore()

  const loading = ref(false)

  const activeArcIds = computed(() => {
    const ids = new Set<string>()
    for (const arc of arcsStore.items) {
      if (arc.status === 'active') ids.add(arc.arcId)
    }
    return ids
  })

  const drafts = computed<Signal[]>(() =>
    signalsStore.allSignals
      .filter((s) => s.status === 'draft' && !!s.arcId && activeArcIds.value.has(s.arcId))
      .sort(byCreatedDesc),
  )

  const draftCount = computed(() => drafts.value.length)

  async function refreshTopArcs() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    if (arcsStore.items.length === 0) {
      await arcsStore.fetchArcs(true)
    }
    const topArcIds = arcsStore.sortedItems
      .filter((a) => a.status === 'active')
      .slice(0, TOP_ARC_LIMIT)
      .map((a) => a.arcId)
    await signalsStore.fetchForArcs(topArcIds)
    loading.value = false
  }

  function removeDraft(arcId: string, signalId: string) {
    signalsStore.removeSignal(arcId, signalId)
  }

  return {
    drafts,
    draftCount,
    loading,
    refreshTopArcs,
    removeDraft,
  }
})
