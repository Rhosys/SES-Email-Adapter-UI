import { ref } from 'vue'

const open = ref(false)

export function useSupportPanel() {
  return { open }
}
