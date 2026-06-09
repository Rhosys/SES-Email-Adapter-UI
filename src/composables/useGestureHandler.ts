import { ref, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface GestureCallbacks {
  /** Fired on a clean single tap (short, minimal movement). Use for click-through logic. */
  onSingleTap?: (containerX: number, containerY: number) => void
  /** Fired when two taps land within 350 ms. */
  onDoubleTap?: (containerX: number, containerY: number) => void
  /** Fired when a fast flick exceeds 50 px in under 300 ms (unzoomed only). */
  onSwipe?: (direction: SwipeDirection) => void
  /** Fired after a stationary press held for 500 ms. */
  onLongPress?: (containerX: number, containerY: number) => void
}

const MIN_SCALE = 1
const MAX_SCALE = 4

function touchDist(a: Touch, b: Touch): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function touchMid(a: Touch, b: Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Attaches touch-gesture recognition to an element and exposes reactive
 * scale / translate state for CSS transforms.
 *
 * Uses transform-origin: 0 0 math so the pinch midpoint stays fixed
 * on screen as scale changes.
 *
 * The caller is responsible for setting `touch-action` on the element:
 *   - scale === 1 → 'pan-y'  (browser scrolls the page normally)
 *   - scale > 1  → 'none'   (we own all touch handling for panning)
 */
export function useGestureHandler(
  elementRef: Ref<HTMLElement | null>,
  callbacks: GestureCallbacks = {},
) {
  const scale = ref(1)
  const translateX = ref(0)
  const translateY = ref(0)
  const isGesturing = ref(false)

  // --- pinch tracking ---
  let pinching = false
  let pinchStartDist = 0
  let pinchStartScale = 1
  let pinchOriginX = 0 // element-space point that stays fixed during pinch
  let pinchOriginY = 0
  let pinchContainerLeft = 0
  let pinchContainerTop = 0

  // --- pan tracking ---
  let panning = false
  let panStartX = 0
  let panStartY = 0
  let panStartTx = 0
  let panStartTy = 0

  // --- tap tracking ---
  let lastTapMs = 0
  let tapStartX = 0
  let tapStartY = 0
  let tapStartMs = 0
  let tapMoved = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  function clearLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  /** Reset zoom and translation back to the natural (1×) state. */
  function reset() {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
  }

  function toContainerCoords(clientX: number, clientY: number) {
    const el = elementRef.value
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function clampedTranslate(tx: number, ty: number, s: number) {
    const el = elementRef.value
    if (!el) return { x: tx, y: ty }
    const w = el.offsetWidth
    const h = el.offsetHeight
    return { x: clamp(tx, w * (1 - s), 0), y: clamp(ty, h * (1 - s), 0) }
  }

  function onTouchStart(e: TouchEvent) {
    const el = elementRef.value
    if (!el) return

    if (e.touches.length === 2) {
      clearLongPress()
      panning = false
      pinching = true
      isGesturing.value = true

      const rect = el.getBoundingClientRect()
      pinchContainerLeft = rect.left
      pinchContainerTop = rect.top
      pinchStartDist = touchDist(e.touches[0], e.touches[1])
      pinchStartScale = scale.value

      // Record element-space origin: the point that should stay fixed on screen
      const m = touchMid(e.touches[0], e.touches[1])
      const cx = m.x - pinchContainerLeft
      const cy = m.y - pinchContainerTop
      pinchOriginX = (cx - translateX.value) / scale.value
      pinchOriginY = (cy - translateY.value) / scale.value
    } else if (e.touches.length === 1 && !pinching) {
      const t = e.touches[0]
      tapStartX = t.clientX
      tapStartY = t.clientY
      tapStartMs = Date.now()
      tapMoved = false

      panning = scale.value > 1
      isGesturing.value = panning
      if (panning) {
        panStartX = t.clientX
        panStartY = t.clientY
        panStartTx = translateX.value
        panStartTy = translateY.value
      }

      longPressTimer = setTimeout(() => {
        if (!tapMoved) {
          const { x, y } = toContainerCoords(tapStartX, tapStartY)
          callbacks.onLongPress?.(x, y)
        }
      }, 500)
    }
  }

  function onTouchMove(e: TouchEvent) {
    const el = elementRef.value
    if (!el) return

    if (e.touches.length === 2 && pinching) {
      e.preventDefault()
      clearLongPress()
      tapMoved = true

      const currentDist = touchDist(e.touches[0], e.touches[1])
      const m = touchMid(e.touches[0], e.touches[1])
      const cx = m.x - pinchContainerLeft
      const cy = m.y - pinchContainerTop

      const newScale = clamp(pinchStartScale * (currentDist / pinchStartDist), MIN_SCALE, MAX_SCALE)
      const { x, y } = clampedTranslate(cx - pinchOriginX * newScale, cy - pinchOriginY * newScale, newScale)

      scale.value = newScale
      translateX.value = x
      translateY.value = y
    } else if (e.touches.length === 1 && panning) {
      e.preventDefault()
      const t = e.touches[0]
      const dx = t.clientX - panStartX
      const dy = t.clientY - panStartY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        tapMoved = true
        clearLongPress()
      }
      const { x, y } = clampedTranslate(panStartTx + dx, panStartTy + dy, scale.value)
      translateX.value = x
      translateY.value = y
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      if (Math.abs(t.clientX - tapStartX) > 5 || Math.abs(t.clientY - tapStartY) > 5) {
        tapMoved = true
        clearLongPress()
      }
    }
  }

  function onTouchEnd(e: TouchEvent) {
    clearLongPress()

    // One finger lifted while pinching → transition to pan if still zoomed
    if (e.touches.length === 1 && pinching) {
      pinching = false
      if (scale.value > 1) {
        const t = e.touches[0]
        panning = true
        panStartX = t.clientX
        panStartY = t.clientY
        panStartTx = translateX.value
        panStartTy = translateY.value
      }
      return
    }

    if (e.touches.length === 0) {
      pinching = false
      panning = false
      isGesturing.value = false
    }

    if (e.changedTouches.length !== 1 || e.touches.length !== 0) return

    const t = e.changedTouches[0]
    const elapsed = Date.now() - tapStartMs
    const dx = t.clientX - tapStartX
    const dy = t.clientY - tapStartY
    const moved = Math.hypot(dx, dy)

    // Swipe — only when at natural scale so it doesn't conflict with pan
    if (scale.value === 1 && moved > 50 && elapsed < 300) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)
      const dir: SwipeDirection =
        angle > -45 && angle <= 45 ? 'right'
        : angle > 45 && angle <= 135 ? 'down'
        : angle < -45 && angle >= -135 ? 'up'
        : 'left'
      callbacks.onSwipe?.(dir)
      return
    }

    // Tap / double-tap
    if (!tapMoved && moved < 10 && elapsed < 300) {
      const now = Date.now()
      const { x, y } = toContainerCoords(t.clientX, t.clientY)
      if (now - lastTapMs < 350) {
        lastTapMs = 0
        callbacks.onDoubleTap?.(x, y)
      } else {
        lastTapMs = now
        callbacks.onSingleTap?.(x, y)
      }
    }
  }

  let removeListeners: (() => void) | null = null

  watch(
    elementRef,
    (el) => {
      removeListeners?.()
      removeListeners = null
      if (el) {
        // passive: true on touchstart — we never preventDefault there
        // passive: false on touchmove — we preventDefault during pinch and pan
        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchmove', onTouchMove, { passive: false })
        el.addEventListener('touchend', onTouchEnd)
        removeListeners = () => {
          el.removeEventListener('touchstart', onTouchStart)
          el.removeEventListener('touchmove', onTouchMove)
          el.removeEventListener('touchend', onTouchEnd)
        }
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    clearLongPress()
    removeListeners?.()
  })

  return { scale, translateX, translateY, isGesturing, reset }
}
