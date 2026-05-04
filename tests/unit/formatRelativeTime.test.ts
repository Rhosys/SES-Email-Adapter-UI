import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/composables/useFormattedTime'

describe('formatRelativeTime', () => {
  const BASE = new Date('2025-01-01T12:00:00Z').getTime()

  it('returns "Just now" for under 60 seconds', () => {
    expect(formatRelativeTime('2025-01-01T11:59:30Z', BASE)).toBe('Just now')
  })

  it('returns minutes ago for under 60 minutes', () => {
    expect(formatRelativeTime('2025-01-01T11:58:00Z', BASE)).toBe('2m ago')
  })

  it('returns hours ago for under 24 hours', () => {
    expect(formatRelativeTime('2025-01-01T09:00:00Z', BASE)).toBe('3h ago')
  })

  it('returns days ago for 24+ hours', () => {
    expect(formatRelativeTime('2024-12-30T12:00:00Z', BASE)).toBe('2d ago')
  })

  it('returns "1m ago" for exactly 60 seconds', () => {
    expect(formatRelativeTime('2025-01-01T11:59:00Z', BASE)).toBe('1m ago')
  })
})
