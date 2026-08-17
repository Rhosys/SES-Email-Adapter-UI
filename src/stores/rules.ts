import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useRulesStore = defineStore('rules', () => {
  const savePending = ref(false)

  return {
    savePending,
  }
})
