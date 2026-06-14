import type { Domain } from '@/types/server'

export const mockDomains: Domain[] = [
  {
    domainId: 'dom_1',
    domain: 'demo.catchmail.app',
    receivingSetupComplete: true,
    senderSetupComplete: true,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-05T00:00:00Z',
  },
  {
    domainId: 'dom_2',
    domain: 'acme-corp.com',
    receivingSetupComplete: false,
    senderSetupComplete: false,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
]
