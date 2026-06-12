import { ref } from 'vue'

const coachVisible = ref(false)

export function useOnboardingCoach() {
  function showCoach() {
    coachVisible.value = true
  }

  function hideCoach() {
    coachVisible.value = false
  }

  return { coachVisible, showCoach, hideCoach }
}
