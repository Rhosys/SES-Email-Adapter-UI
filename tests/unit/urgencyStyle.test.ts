import { describe, it, expect } from 'vitest'
import { urgencyStripeColor } from '@/composables/useUrgencyStyle'

describe('urgencyStripeColor', () => {
  it('maps critical to red CSS var', () => {
    expect(urgencyStripeColor('critical')).toBe('var(--color-red)')
  })

  it('maps high to peach CSS var', () => {
    expect(urgencyStripeColor('high')).toBe('var(--color-peach)')
  })

  it('maps normal to blue CSS var', () => {
    expect(urgencyStripeColor('normal')).toBe('var(--color-blue)')
  })

  it('maps low to overlay0 CSS var', () => {
    expect(urgencyStripeColor('low')).toBe('var(--color-overlay0)')
  })

  it('maps silent to surface1 (invisible)', () => {
    expect(urgencyStripeColor('silent')).toBe('var(--color-surface1)')
  })

  it('handles undefined as surface1', () => {
    expect(urgencyStripeColor(undefined)).toBe('var(--color-surface1)')
  })
})
