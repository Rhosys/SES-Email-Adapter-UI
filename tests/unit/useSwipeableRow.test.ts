import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSwipeableRow } from '@/composables/useSwipeableRow'

// Build a minimal TouchEvent-like object the handlers can read.
function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }], preventDefault: () => {} }
}

describe('useSwipeableRow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires long-press after the hold delay when the finger stays still', () => {
    const onLongPress = vi.fn()
    const row = useSwipeableRow({ onLongPress, longPressMs: 500 })

    row.onTouchStart(touch(0, 0))
    vi.advanceTimersByTime(500)

    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('cancels long-press once the gesture becomes a horizontal drag', () => {
    const onLongPress = vi.fn()
    const row = useSwipeableRow({ onLongPress, longPressMs: 500 })

    row.onTouchStart(touch(100, 100))
    row.onTouchMove(touch(60, 100)) // 40px left → horizontal
    vi.advanceTimersByTime(500)

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('snaps open past the threshold and reports the click as consumed', () => {
    const row = useSwipeableRow({ threshold: 100, actionWidth: 112 })

    row.onTouchStart(touch(200, 100))
    row.onTouchMove(touch(80, 100)) // dx = -120, past threshold
    expect(row.offset.value).toBe(-120)
    row.onTouchEnd()

    expect(row.offset.value).toBe(-112) // snapped to the action width
    expect(row.consumeClick()).toBe(true) // the swipe swallows the trailing click
  })

  it('snaps back closed when released short of the threshold', () => {
    const row = useSwipeableRow({ threshold: 100, actionWidth: 112 })

    row.onTouchStart(touch(200, 100))
    row.onTouchMove(touch(160, 100)) // dx = -40, below threshold
    row.onTouchEnd()

    expect(row.offset.value).toBe(0)
  })

  it('does not drag when swipe is disabled, and lets a clean tap through', () => {
    const row = useSwipeableRow({ enabled: () => false })

    row.onTouchStart(touch(200, 100))
    row.onTouchMove(touch(80, 100))
    row.onTouchEnd()

    expect(row.offset.value).toBe(0)
    expect(row.consumeClick()).toBe(false) // nothing happened → navigation allowed
  })

  it('leaves vertical scrolls alone (no horizontal offset)', () => {
    const row = useSwipeableRow()

    row.onTouchStart(touch(100, 100))
    row.onTouchMove(touch(100, 40)) // 60px up → vertical
    row.onTouchEnd()

    expect(row.offset.value).toBe(0)
    expect(row.consumeClick()).toBe(false)
  })
})
