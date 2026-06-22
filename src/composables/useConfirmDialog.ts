import { ref } from 'vue'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  requireInput?: string
  requireInputLabel?: string
}

const dialogOpen = ref(false)
const dialogOptions = ref<ConfirmOptions>({ title: '', message: '' })
let resolvePromise: ((confirmed: boolean) => void) | null = null

export function useConfirmDialog() {
  async function confirm(options: ConfirmOptions): Promise<boolean> {
    dialogOptions.value = options
    dialogOpen.value = true
    return new Promise<boolean>((resolve) => {
      resolvePromise = resolve
    })
  }

  function onConfirm() {
    dialogOpen.value = false
    resolvePromise?.(true)
    resolvePromise = null
  }

  function onCancel() {
    dialogOpen.value = false
    resolvePromise?.(false)
    resolvePromise = null
  }

  return { dialogOpen, dialogOptions, confirm, onConfirm, onCancel }
}
