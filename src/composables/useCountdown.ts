import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface CountdownState {
  remaining: number
  isExpired: boolean
  urgencyLevel: 'safe' | 'warning' | 'critical' | 'expired'
  display: string
}

export function useCountdown(expiresAt: Date | null) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval>

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })

  onUnmounted(() => clearInterval(timer))

  const state = computed<CountdownState>(() => {
    if (!expiresAt) {
      return { remaining: 0, isExpired: false, urgencyLevel: 'safe', display: '' }
    }

    const ms = expiresAt.getTime() - now.value
    const seconds = Math.floor(ms / 1000)

    if (seconds <= 0) {
      return { remaining: 0, isExpired: true, urgencyLevel: 'expired', display: 'Expired' }
    }

    const minutes = Math.floor(seconds / 60)

    if (seconds < 120) {
      return {
        remaining: seconds,
        isExpired: false,
        urgencyLevel: 'critical',
        display: `Expires in ${seconds}s`,
      }
    }

    if (minutes < 5) {
      const remainingSecs = seconds % 60
      return {
        remaining: seconds,
        isExpired: false,
        urgencyLevel: 'critical',
        display: `Expires in ${minutes}m ${remainingSecs}s`,
      }
    }

    if (minutes < 300) {
      return {
        remaining: seconds,
        isExpired: false,
        urgencyLevel: 'warning',
        display: `Expires in ${minutes}m`,
      }
    }

    const hours = Math.floor(minutes / 60)
    return {
      remaining: seconds,
      isExpired: false,
      urgencyLevel: 'safe',
      display: `Expires in ${hours}h`,
    }
  })

  return state
}
