import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'ses:ui:statsExpanded'

export const useUiStore = defineStore('ui', () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const statsWidgetExpanded = ref<boolean>(stored === null ? true : JSON.parse(stored) as boolean)

  watch(statsWidgetExpanded, (v) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  })

  return { statsWidgetExpanded }
})
