import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const statsWidgetExpanded = ref(false)

  return { statsWidgetExpanded }
})
