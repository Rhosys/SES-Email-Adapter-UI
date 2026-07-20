import { describe, it, expect } from 'vitest'
import { computeTooltipPosition } from '@/lib/tooltipPosition'

const VIEWPORT = { width: 1280, height: 800 }
const CARD = { width: 288, height: 200 }

describe('computeTooltipPosition', () => {
  it('prefers the right side when there is room', () => {
    const spotlight = { left: 100, top: 300, width: 200, height: 40 }
    const { left, top } = computeTooltipPosition(spotlight, VIEWPORT, CARD)
    expect(left).toBe(100 + 200 + 16)
    expect(top).toBeCloseTo(300 + 20 - 100)
  })

  it('falls back to the left side when the right is too tight', () => {
    // Spotlight near the right edge — not enough room to its right for the card.
    const spotlight = { left: 1100, top: 300, width: 150, height: 40 }
    const { left } = computeTooltipPosition(spotlight, VIEWPORT, CARD)
    expect(left).toBe(1100 - 288 - 16)
  })

  it('falls back to below when neither side has room (narrow viewport)', () => {
    const narrow = { width: 390, height: 844 }
    // Spotlight spans nearly the full narrow width — no room left or right.
    const spotlight = { left: 8, top: 100, width: 374, height: 40 }
    const { top, left } = computeTooltipPosition(spotlight, narrow, CARD)
    expect(top).toBe(100 + 40 + 16)
    expect(left).toBeCloseTo(8 + 374 / 2 - 288 / 2)
  })

  it('falls back to above when below is also too tight', () => {
    const narrow = { width: 390, height: 900 }
    // Near the bottom of a tall viewport — not enough room below, plenty above.
    const spotlight = { left: 8, top: 700, width: 374, height: 150 }
    const { top } = computeTooltipPosition(spotlight, narrow, CARD)
    expect(top).toBe(700 - 200 - 16)
  })

  it('centers the card when no side has room at all', () => {
    const tiny = { width: 300, height: 250 }
    const spotlight = { left: 0, top: 0, width: 300, height: 250 }
    const { left, top } = computeTooltipPosition(spotlight, tiny, CARD)
    // The ideal centered position (6, 25) doesn't clear the 8px edge margin on
    // this axis, so it's pulled in to the margin itself rather than clipped.
    expect(left).toBe(8)
    expect(top).toBeCloseTo((250 - 200) / 2)
  })

  it('never places the card off the left/top edge', () => {
    const spotlight = { left: -50, top: -50, width: 20, height: 20 }
    const { left, top } = computeTooltipPosition(spotlight, VIEWPORT, CARD)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(top).toBeGreaterThanOrEqual(8)
  })

  it('never places the card off the right/bottom edge', () => {
    const spotlight = { left: 1250, top: 780, width: 20, height: 20 }
    const { left, top } = computeTooltipPosition(spotlight, VIEWPORT, CARD)
    expect(left).toBeLessThanOrEqual(VIEWPORT.width - CARD.width - 8)
    expect(top).toBeLessThanOrEqual(VIEWPORT.height - CARD.height - 8)
  })
})
