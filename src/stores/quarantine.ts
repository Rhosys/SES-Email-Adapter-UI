import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface QuarantineFilters {
  sender: string
  after: string
  before: string
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const actionPending = ref<Set<string>>(new Set())

  return { actionPending }
})
