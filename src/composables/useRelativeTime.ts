import { ref, provide, onMounted, onUnmounted, type Ref } from 'vue'

export const NOW_KEY: InjectionKey<Ref<number>> = Symbol('now')

import type { InjectionKey } from 'vue'

export function useRelativeTime() {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval>

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 30_000)
  })

  onUnmounted(() => clearInterval(timer))

  provide(NOW_KEY, now)
  return { now }
}
