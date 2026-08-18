import { ref } from 'vue'
import { defineStore } from 'pinia'

// Gutted — all fetch logic, data refs, loading/cursor state, and query-cache
// facade methods removed. Signal data lives in TanStack Query; cache helpers
// moved to src/composables/useSignalQueries.ts (useSignalCacheHelpers).
export const useSignalsStore = defineStore('signals', () => {
  const currentThreadId = ref<string | null>(null)

  return { currentThreadId }
})
