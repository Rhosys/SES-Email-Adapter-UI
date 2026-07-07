import { ref } from 'vue'
import logger from '@/lib/logger'

export function useClipboard() {
  const copied = ref(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 1500)
    } catch (e) {
      logger.warn({ title: 'Clipboard write failed', error: e })
    }
  }

  return { copied, copy }
}
