import type { ArcUrgency } from '@/types/server'

export function urgencyStripeColor(urgency: ArcUrgency | undefined): string {
  switch (urgency) {
    case 'critical':
      return 'var(--color-red)'
    case 'high':
      return 'var(--color-peach)'
    case 'normal':
      return 'var(--color-blue)'
    case 'low':
      return 'var(--color-overlay0)'
    case 'silent':
    default:
      return 'var(--color-surface1)'
  }
}
