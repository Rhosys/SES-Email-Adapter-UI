import { ref } from 'vue'

export function useClipboard() {
  const copied = ref(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 1500)
    } catch {
      // Silent failure — clipboard access may be denied
    }
  }

  return { copied, copy }
}
