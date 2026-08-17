import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSpamStore = defineStore('spam', () => {
  const actionPending = ref<Set<string>>(new Set())

  function clearError() { /* no-op — error comes from query */ }

  return { actionPending, clearError }
})
