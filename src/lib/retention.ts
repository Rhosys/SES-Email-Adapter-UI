import type { RetentionDuration } from '@/types/server'

const DURATION_MS: Record<string, number> = {
  P1M: 30 * 24 * 60 * 60 * 1000,
  P2M: 60 * 24 * 60 * 60 * 1000,
  P3M: 90 * 24 * 60 * 60 * 1000,
  P5M: 150 * 24 * 60 * 60 * 1000,
  P6M: 180 * 24 * 60 * 60 * 1000,
  P1Y: 365 * 24 * 60 * 60 * 1000,
  P2Y: 730 * 24 * 60 * 60 * 1000,
  P5Y: 1825 * 24 * 60 * 60 * 1000,
  P10Y: 3650 * 24 * 60 * 60 * 1000,
}

/**
 * Returns a formatted expiration date string, or null for infinite retention.
 */
export function retentionExpiresAt(createdAt: string, duration: RetentionDuration): string | null {
  if (duration === 'P100Y' || duration === 'Infinity') return null
  const ms = DURATION_MS[duration]
  if (!ms) return null
  const expires = new Date(new Date(createdAt).getTime() + ms)
  return expires.toLocaleDateString(undefined, { dateStyle: 'medium' })
}
