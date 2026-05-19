import { ref } from 'vue'

export interface ToastItem {
  id: string
  message: string
  submessage?: string
  undoMs: number
  startedAt: number
  undoLabel: string
  /** 'undo' = action already done, undo reverses it; 'deferred' = action pending, timeout commits it */
  type: 'undo' | 'deferred'
  onUndo?: () => void | Promise<void>
  onCommit?: () => void | Promise<void>
}

// Module-level singleton — one toast queue for the whole app.
const toasts = ref<ToastItem[]>([])
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function _remove(id: string): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
  const t = timers.get(id)
  if (t !== undefined) clearTimeout(t)
  timers.delete(id)
}

export function useToast() {
  /** Action already happened — show undo window. onUndo reverses it. */
  function showUndo(
    message: string,
    onUndo: () => void | Promise<void>,
    undoMs: number,
    opts?: { submessage?: string; undoLabel?: string },
  ): string {
    const id = crypto.randomUUID()
    toasts.value.push({
      id,
      message,
      submessage: opts?.submessage,
      undoMs,
      startedAt: Date.now(),
      undoLabel: opts?.undoLabel ?? 'Undo',
      type: 'undo',
      onUndo,
    })
    timers.set(id, setTimeout(() => _remove(id), undoMs))
    return id
  }

  /** Action is deferred — fires onCommit after undoMs unless cancelled first. */
  function deferAction(
    message: string,
    onCommit: () => void | Promise<void>,
    undoMs: number,
    opts?: { submessage?: string; undoLabel?: string; onUndo?: () => void },
  ): string {
    const id = crypto.randomUUID()
    toasts.value.push({
      id,
      message,
      submessage: opts?.submessage,
      undoMs,
      startedAt: Date.now(),
      undoLabel: opts?.undoLabel ?? 'Cancel',
      type: 'deferred',
      onUndo: opts?.onUndo,
      onCommit,
    })
    timers.set(id, setTimeout(() => {
      void onCommit()
      _remove(id)
    }, undoMs))
    return id
  }

  /** Cancel / undo — calls onUndo if present, discards the deferred commit. */
  function undo(id: string): void {
    const toast = toasts.value.find((t) => t.id === id)
    if (!toast) return
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
    if (toast.onUndo) void toast.onUndo()
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /** Dismiss without reversing — for deferred toasts this commits immediately. */
  function dismiss(id: string): void {
    const toast = toasts.value.find((t) => t.id === id)
    if (!toast) return
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
    if (toast.onCommit) void toast.onCommit()
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, showUndo, deferAction, undo, dismiss }
}

/**
 * Returns how long (ms) the user should have to cancel a send, scaled by content length.
 * Short emails: 10 s. Long emails: up to 5 min.
 */
export function undoWindowMs(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length
  if (words < 50) return 10_000        // < 50 words  → 10 s
  if (words < 200) return 60_000       // 50–199 words → 1 min
  if (words < 500) return 180_000      // 200–499 words → 3 min
  return 300_000                        // 500+ words  → 5 min
}
