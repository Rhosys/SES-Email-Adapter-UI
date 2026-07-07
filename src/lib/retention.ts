import { Duration } from 'luxon'
import type { RetentionDuration } from '@/types/server'

/**
 * Returns a formatted expiration date string, or null for infinite retention.
 */
export function retentionExpiresAt(createdAt: string, duration: RetentionDuration): string | null {
  if (duration === 'P100Y' || duration === 'Infinity') return null
  const d = Duration.fromISO(duration)
  if (!d.isValid) return null
  const ms = d.toMillis()
  if (!ms) return null
  const expiresAt = new Date(new Date(createdAt).getTime() + ms)
  return expiresAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
