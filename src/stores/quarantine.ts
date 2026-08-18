import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useQuarantineStore = defineStore('quarantine', () => {
  const actionPending = ref<Set<string>>(new Set())

  return { actionPending }
})
