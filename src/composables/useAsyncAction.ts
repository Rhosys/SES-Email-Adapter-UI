import { ref, type Ref } from 'vue'

export type AsyncState = 'idle' | 'pending' | 'success'

export interface UseAsyncActionReturn {
  state: Ref<AsyncState>
  run: () => Promise<void>
}

const MIN_SPIN_MS = 100
const SUCCESS_DISPLAY_MS = 500

export function useAsyncAction(action: () => Promise<unknown>): UseAsyncActionReturn {
  const state = ref<AsyncState>('idle')

  async function run(): Promise<void> {
    if (state.value !== 'idle') return

    state.value = 'pending'
    const start = performance.now()

    try {
      await action()
      const elapsed = performance.now() - start
      const remaining = MIN_SPIN_MS - elapsed
      if (remaining > 0) await sleep(remaining)

      state.value = 'success'
      await sleep(SUCCESS_DISPLAY_MS)
    } finally {
      state.value = 'idle'
    }
  }

  return { state, run }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
