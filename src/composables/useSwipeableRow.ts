import { ref, onBeforeUnmount } from 'vue'

// Touch gestures for a thread-list row:
//   • Long-press (held ~500ms without moving) → onLongPress (used to toggle the
//     row into the bulk-selection set).
//   • Horizontal swipe → the row slides with the finger; released past the
//     threshold it snaps open to reveal a quick action (e.g. Archive), otherwise
//     it snaps back closed.
// Single-finger vertical movement is left to the browser so the list still
// scrolls. Desktop is unaffected — none of these touch handlers fire without a
// touchscreen, so the existing hover controls keep working.

export interface UseSwipeableRowOptions {
  /** Whether swipe-to-reveal is active (false → long-press only, list scrolls). */
  enabled?: () => boolean
  /** Drag distance (px) past which release snaps the row open. */
  threshold?: number
  /** Open offset (px) — how far the row rests when revealing the action. */
  actionWidth?: number
  /** Hard clamp on how far the row can be dragged. */
  maxDrag?: number
  /** Long-press duration in ms. */
  longPressMs?: number
  onLongPress?: () => void
}

// Minimal shape we read off a TouchEvent — keeps the handlers unit-testable
// without constructing real TouchEvents.
interface TouchLike {
  touches: ArrayLike<{ clientX: number; clientY: number }>
  preventDefault?: () => void
}

// Dead-zone (px) the finger must travel before we commit to an axis. Below it,
// tiny jitter during a tap/long-press is ignored so it doesn't register as a
// drag; once exceeded we lock to horizontal (swipe) or vertical (list scroll).
const DRAG_START_TOLERANCE_PX = 10

export function useSwipeableRow(opts: UseSwipeableRowOptions = {}) {
  const threshold = opts.threshold ?? 100
  const actionWidth = opts.actionWidth ?? 112
  const maxDrag = opts.maxDrag ?? 140
  const longPressMs = opts.longPressMs ?? 500

  const offset = ref(0)
  const dragging = ref(false)

  let startX = 0
  let startY = 0
  let startOffset = 0
  let axis: 'h' | 'v' | null = null
  let gestured = false // a swipe or long-press happened → suppress the trailing click
  let touchActive = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  function clearLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  function close() {
    offset.value = 0
  }

  function onTouchStart(e: TouchLike) {
    if (e.touches.length !== 1) {
      clearLongPress()
      return
    }
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    startOffset = offset.value
    axis = null
    gestured = false
    touchActive = true
    clearLongPress()

    // Long-press only makes sense from the closed state.
    if (offset.value === 0) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        if (!touchActive || axis === 'h') return
        gestured = true
        navigator.vibrate?.(10)
        opts.onLongPress?.()
      }, longPressMs)
    }
  }

  function onTouchMove(e: TouchLike) {
    if (!touchActive || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - startX
    const dy = e.touches[0].clientY - startY

    if (axis === null) {
      if (Math.abs(dx) > DRAG_START_TOLERANCE_PX || Math.abs(dy) > DRAG_START_TOLERANCE_PX) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        clearLongPress()
      } else {
        return
      }
    }

    if (axis !== 'h') return // vertical → let the list scroll
    if (opts.enabled && !opts.enabled()) return

    e.preventDefault?.()
    gestured = true
    dragging.value = true
    offset.value = clamp(startOffset + dx, -maxDrag, maxDrag)
  }

  function onTouchEnd() {
    clearLongPress()
    touchActive = false
    if (axis === 'h') {
      dragging.value = false
      if (offset.value <= -threshold) offset.value = -actionWidth
      else if (offset.value >= threshold) offset.value = actionWidth
      else offset.value = 0
    }
    axis = null
  }

  /** Call from a capture-phase click handler. Returns true when the click
   *  should be swallowed (a gesture just happened, or an open row was tapped). */
  function consumeClick(): boolean {
    if (gestured) {
      gestured = false
      return true
    }
    if (offset.value !== 0) {
      close()
      return true
    }
    return false
  }

  onBeforeUnmount(clearLongPress)

  return { offset, dragging, close, onTouchStart, onTouchMove, onTouchEnd, consumeClick }
}
