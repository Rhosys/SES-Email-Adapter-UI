import { computed, ref, onUnmounted } from 'vue'
import type { Signal } from '@/types/server'
import { isOutboundEmailSignal } from '@/lib/signal-guards'

/**
 * Computes the undo window (seconds) from email body length.
 * Must match backend logic in undo-window.ts exactly.
 */
function computeUndoWindowSeconds(textBody: string | undefined): number {
  const wordCount = textBody?.trim().split(/\s+/).filter(Boolean).length ?? 0
  if (wordCount < 50) return 10
  if (wordCount < 200) return 60
  if (wordCount < 500) return 180
  return 300
}

/**
 * For a pending_send signal, computes when the undo window expires
 * based on sendInitiatedAt + body length.
 */
export function getUndoExpiresAt(signal: Signal): string | null {
  if (signal.status !== 'pending_send') return null
  if (!isOutboundEmailSignal(signal)) return null
  const { sendInitiatedAt, body } = signal.data
  if (!sendInitiatedAt) return null
  const windowMs = computeUndoWindowSeconds(body) * 1000
  return new Date(new Date(sendInitiatedAt).getTime() + windowMs).toISOString()
}

/**
 * Reactive composable that tracks whether a signal is still within its undo window.
 * Returns `cancellable` (true while countdown active) and `remainingSeconds`.
 */
export function usePendingSendCountdown(signal: Signal) {
  const expiresAt = getUndoExpiresAt(signal)
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0

  const remainingSeconds = ref(Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)))
  const cancellable = computed(() => remainingSeconds.value > 0)

  let timer: ReturnType<typeof setInterval> | null = null

  if (expiresMs > Date.now()) {
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000))
      remainingSeconds.value = left
      if (left <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { cancellable, remainingSeconds, expiresAt }
}
