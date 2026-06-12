import { ref } from 'vue'

const TOUR_COMPLETE_KEY = 'ses:tourCompleted'

const active = ref(false)

export function useFeatureTour() {
  return {
    tourActive: active,
    startTour: () => {
      active.value = true
    },
    endTour: () => {
      active.value = false
      localStorage.setItem(TOUR_COMPLETE_KEY, '1')
    },
  }
}
