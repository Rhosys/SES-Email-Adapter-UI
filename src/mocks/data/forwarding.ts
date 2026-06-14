import type { ForwardingAddress } from '@/types/server'

export const mockForwardingAddresses: ForwardingAddress[] = [
  {
    address: 'warren.personal@gmail.com',
    status: 'verified',
    createdAt: '2026-01-10T00:00:00Z',
    verifiedAt: '2026-01-10T00:05:00Z',
  },
  {
    address: 'team-inbox@acme-corp.com',
    status: 'pending',
    createdAt: '2026-06-08T14:00:00Z',
  },
]
