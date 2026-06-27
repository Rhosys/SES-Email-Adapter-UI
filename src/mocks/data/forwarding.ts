import type { ForwardingTarget } from '@/types/server'

export const mockForwardingTargets: ForwardingTarget[] = [
  {
    target: 'warren.personal@gmail.com',
    type: 'email',
    status: 'verified',
    createdAt: '2026-01-10T00:00:00Z',
    verifiedAt: '2026-01-10T00:05:00Z',
  },
  {
    target: 'https://hooks.slack.com/services/T00/B00/xxx',
    type: 'webhook',
    status: 'verified',
    createdAt: '2026-03-15T09:00:00Z',
    verifiedAt: '2026-03-15T09:01:00Z',
  },
  {
    target: 'team-inbox@acme-corp.com',
    type: 'email',
    status: 'pending',
    createdAt: '2026-06-08T14:00:00Z',
  },
]
