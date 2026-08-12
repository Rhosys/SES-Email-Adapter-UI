import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseResourceDate, dayKey, isResourceDatePast } from '@/lib/resourceDate'

describe('parseResourceDate', () => {
  it('anchors a bare calendar date to local midnight, not UTC midnight', () => {
    const date = parseResourceDate('2026-08-26')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(7) // August
    expect(date.getDate()).toBe(26)
    expect(date.getHours()).toBe(0)
  })

  it('preserves time-of-day and UTC offset when both are present', () => {
    const date = parseResourceDate('2026-08-26T17:00+00:00')
    expect(date.toISOString()).toBe('2026-08-26T17:00:00.000Z')
  })

  it('preserves time-of-day when only time is present (no seconds)', () => {
    const date = parseResourceDate('2026-08-26T09:30Z')
    expect(date.toISOString()).toBe('2026-08-26T09:30:00.000Z')
  })

  it('does not corrupt a full datetime by treating it as a bare date', () => {
    // Regression: naive `dateStr + 'T00:00:00'` concatenation on a full
    // datetime produces an unparseable string ("...+00:00T00:00:00").
    const date = parseResourceDate('2026-08-26T17:00+00:00')
    expect(Number.isNaN(date.getTime())).toBe(false)
  })
})

describe('dayKey', () => {
  it('returns the same key for a Date and its equivalent string', () => {
    const fromString = dayKey('2026-08-26')
    const fromDate = dayKey(new Date(2026, 7, 26))
    expect(fromString).toBe(fromDate)
    expect(fromString).toBe('2026-08-26')
  })

  it('buckets a full datetime by its local calendar day', () => {
    expect(dayKey('2026-08-26T17:00+00:00')).toBe(dayKey(new Date('2026-08-26T17:00+00:00')))
  })
})

describe('isResourceDatePast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats a bare date as past only once the whole day has elapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 26, 1, 0, 0)) // Aug 26, 1am local
    // Due "today" — not past yet, even though the day has technically started.
    expect(isResourceDatePast('2026-08-26')).toBe(false)
    // Due yesterday — past.
    expect(isResourceDatePast('2026-08-25')).toBe(true)
  })

  it('treats a full datetime as past based on the actual moment, not the calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    // Later today (UTC) — not past yet.
    expect(isResourceDatePast('2026-08-26T18:00:00Z')).toBe(false)
    // Earlier today (UTC) — already past, even though it's still "today".
    expect(isResourceDatePast('2026-08-26T06:00:00Z')).toBe(true)
  })
})
