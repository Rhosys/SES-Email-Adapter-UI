import { ref } from 'vue'

const active = ref(false)

export function useFeatureTour() {
  return {
    tourActive: active,
    startTour: () => {
      active.value = true
    },
    endTour: () => {
      active.value = false
    },
  }
}
