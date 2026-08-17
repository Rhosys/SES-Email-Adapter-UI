import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThreadsStore = defineStore('threads', () => {
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  function toggleSelect(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  function selectAll(threadIds: string[]) {
    threadIds.forEach((id) => selectedIds.value.add(id))
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  return {
    selectedIds,
    bulkActionPending,
    toggleSelect,
    selectAll,
    clearSelection,
  }
})
