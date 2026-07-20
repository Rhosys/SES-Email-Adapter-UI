export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

const GAP = 16
const EDGE_MARGIN = 8

/**
 * Picks a side (right → left → below → above) for a tooltip card next to a
 * spotlighted rect, preferring whichever has room for the card, and falls
 * back to centering the card over the viewport if none do (e.g. a large
 * spotlight on a small mobile screen). Always clamped within the viewport.
 */
export function computeTooltipPosition(
  spotlight: Rect,
  viewport: Size,
  card: Size,
): { left: number; top: number } {
  const spaceRight = viewport.width - (spotlight.left + spotlight.width)
  const spaceLeft = spotlight.left
  const spaceBelow = viewport.height - (spotlight.top + spotlight.height)
  const spaceAbove = spotlight.top

  let left: number
  let top: number

  if (spaceRight >= card.width + GAP) {
    left = spotlight.left + spotlight.width + GAP
    top = spotlight.top + spotlight.height / 2 - card.height / 2
  } else if (spaceLeft >= card.width + GAP) {
    left = spotlight.left - card.width - GAP
    top = spotlight.top + spotlight.height / 2 - card.height / 2
  } else if (spaceBelow >= card.height + GAP) {
    top = spotlight.top + spotlight.height + GAP
    left = spotlight.left + spotlight.width / 2 - card.width / 2
  } else if (spaceAbove >= card.height + GAP) {
    top = spotlight.top - card.height - GAP
    left = spotlight.left + spotlight.width / 2 - card.width / 2
  } else {
    left = (viewport.width - card.width) / 2
    top = (viewport.height - card.height) / 2
  }

  left = clamp(left, EDGE_MARGIN, viewport.width - card.width - EDGE_MARGIN)
  top = clamp(top, EDGE_MARGIN, viewport.height - card.height - EDGE_MARGIN)
  return { left, top }
}

function clamp(value: number, min: number, max: number): number {
  // When the card is wider/taller than the viewport minus margins, min > max
  // — fall back to the (negative) margin rather than an inverted range.
  if (min > max) return min
  return Math.min(Math.max(value, min), max)
}
