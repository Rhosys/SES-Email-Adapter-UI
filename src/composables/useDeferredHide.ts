import { ref } from 'vue'
import { useToast } from '@/composables/useToast'

/**
 * App-level optimistic hide. Items are hidden immediately from rendered lists
 * while a deferred action counts down. On undo the item reappears; on commit the
 * store is updated normally and the ID is cleaned up.
 *
 * No store mutations happen until the deferred timer expires.
 *
 * Module-level singleton — shared across all views so hiding in one view
 * (e.g. ThreadDetailView) is visible in another (e.g. InboxView).
 */
const hiddenIds = ref(new Set<string>())

export function useDeferredHide() {
  const { deferAction } = useToast()

  function hideWithDefer(
    id: string,
    message: string,
    onCommit: () => void | Promise<void>,
    undoMs: number,
    opts?: { submessage?: string; undoLabel?: string },
  ): string {
    hiddenIds.value = new Set([...hiddenIds.value, id])

    return deferAction(
      message,
      async () => {
        await onCommit()
        hiddenIds.value = new Set([...hiddenIds.value].filter((x) => x !== id))
      },
      undoMs,
      {
        submessage: opts?.submessage,
        undoLabel: opts?.undoLabel ?? 'Undo',
        onUndo: () => {
          hiddenIds.value = new Set([...hiddenIds.value].filter((x) => x !== id))
        },
      },
    )
  }

  return { hiddenIds, hideWithDefer }
}
