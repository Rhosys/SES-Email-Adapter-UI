import { ref } from 'vue'

const TOUR_COMPLETE_KEY = 'ses:tourCompleted'

const active = ref(false)

export function useFeatureTour() {
  return {
    tourActive: active,
    tourCompleted: () => localStorage.getItem(TOUR_COMPLETE_KEY) === '1',
    startTour: () => {
      if (localStorage.getItem(TOUR_COMPLETE_KEY)) return
      active.value = true
    },
    endTour: () => {
      active.value = false
      localStorage.setItem(TOUR_COMPLETE_KEY, '1')
    },
  }
}
