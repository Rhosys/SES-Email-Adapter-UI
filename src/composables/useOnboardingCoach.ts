import { ref } from 'vue'

const coachActive = ref(false)
const armed = ref(false)
let armTimer: ReturnType<typeof setTimeout> | null = null

export function useOnboardingCoach() {
  function arm() {
    if (armed.value || coachActive.value) return
    armed.value = true
    armTimer = setTimeout(() => {
      armTimer = null
      coachActive.value = true
    }, 20_000)
  }

  function trigger() {
    if (coachActive.value) return
    if (armTimer) {
      clearTimeout(armTimer)
      armTimer = null
    }
    armed.value = false
    coachActive.value = true
  }

  function dismissCoach() {
    coachActive.value = false
    armed.value = false
    if (armTimer) {
      clearTimeout(armTimer)
      armTimer = null
    }
  }

  return { coachActive, armed, arm, trigger, dismissCoach }
}
