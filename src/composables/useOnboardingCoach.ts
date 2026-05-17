import { ref } from 'vue'

const coachVisible = ref(false)
const countdownRunning = ref(false)
let arcViewCountdown: ReturnType<typeof setTimeout> | null = null

export function useOnboardingCoach() {
  function startArcViewCountdown() {
    if (countdownRunning.value || coachVisible.value) return
    countdownRunning.value = true
    arcViewCountdown = setTimeout(() => {
      arcViewCountdown = null
      coachVisible.value = true
    }, 20_000)
  }

  function showCoachNow() {
    if (coachVisible.value) return
    if (arcViewCountdown) {
      clearTimeout(arcViewCountdown)
      arcViewCountdown = null
    }
    countdownRunning.value = false
    coachVisible.value = true
  }

  function hideCoach() {
    coachVisible.value = false
    countdownRunning.value = false
    if (arcViewCountdown) {
      clearTimeout(arcViewCountdown)
      arcViewCountdown = null
    }
  }

  return { coachVisible, countdownRunning, startArcViewCountdown, showCoachNow, hideCoach }
}
