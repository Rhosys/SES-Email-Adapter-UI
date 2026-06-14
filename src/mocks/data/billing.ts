import type { BillingInfo } from '@/types/server'

export const mockBilling: BillingInfo = {
  plan: 'pro',
  status: 'active',
  currentPeriodEnd: '2026-07-01T00:00:00Z',
  cancelAtPeriodEnd: false,
}
