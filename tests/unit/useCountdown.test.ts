import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCountdown } from '@/composables/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty display when expiresAt is null', () => {
    const state = useCountdown(null)
    expect(state.value.display).toBe('')
    expect(state.value.isExpired).toBe(false)
  })

  it('returns expired state when past expiry', () => {
    const past = new Date(Date.now() - 10_000)
    const state = useCountdown(past)
    expect(state.value.isExpired).toBe(true)
    expect(state.value.urgencyLevel).toBe('expired')
    expect(state.value.display).toBe('Expired just now')
  })

  it('returns critical urgency for < 2 minutes', () => {
    const soon = new Date(Date.now() + 90_000)
    const state = useCountdown(soon)
    expect(state.value.urgencyLevel).toBe('critical')
    expect(state.value.display).toContain('s')
  })

  it('returns warning urgency for 2–5 minutes', () => {
    const upcoming = new Date(Date.now() + 3 * 60_000)
    const state = useCountdown(upcoming)
    expect(state.value.urgencyLevel).toBe('critical')
    expect(state.value.display).toContain('m')
  })

  it('returns safe urgency for > 5 hours', () => {
    const future = new Date(Date.now() + 360 * 60_000)
    const state = useCountdown(future)
    expect(state.value.urgencyLevel).toBe('safe')
    expect(state.value.display).toContain('h')
  })
})
