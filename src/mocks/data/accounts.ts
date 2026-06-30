import type { Account } from '@/types/server'

export const mockAccounts: Account[] = [
  {
    accountId: 'acc_demo_1',
    name: 'Demo Workspace',
    retentionDuration: 'P6M',
    notifications: { email: { enabled: true, address: 'warren@example.com', frequency: 'daily' } },
    filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
    onboarding: { completed: true, completedAt: '2026-01-15T10:00:00Z', testEmailReceived: true },
    billingPlan: 'pro',
    defaultCalendarInviteForwardingTargetId: 'warren.personal@gmail.com',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-10T08:30:00Z',
  },
  {
    accountId: 'acc_demo_2',
    name: 'Side Project',
    filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
]
