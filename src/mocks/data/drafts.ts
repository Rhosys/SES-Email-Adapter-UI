import type { Signal } from '@/types/server'

export const mockDraftSignals: Signal[] = [
  {
    signalId: 'sig_draft_1',
    threadId: 'thr_conv_1',
    source: 'user',
    status: 'draft',
    type: 'email',
    createdAt: '2026-06-11T08:00:00Z',
    data: {
      from: { address: 'work@demo.catchmail.app', name: 'Warren Parad' },
      to: [{ address: 'alex@acme-corp.com', name: 'Alex Chen' }],
      cc: [{ address: 'pm@acme-corp.com', name: 'Product' }],
      bcc: [],
      subject: 'Re: Q3 roadmap priorities',
      body: 'Yes, let\'s add webhook retries to the list — I\'ll loop in the infra team this week.',
      attachments: [],
      sendInitiatedAt: '',
    },
  },
  {
    signalId: 'sig_draft_2',
    threadId: 'thr_conv_2',
    source: 'user',
    status: 'draft',
    type: 'email',
    createdAt: '2026-06-09T16:45:00Z',
    data: {
      from: { address: 'hello@demo.catchmail.app', name: 'Warren Parad' },
      to: [{ address: 'support@vendor-co.com', name: 'Vendor Support' }],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      attachments: [],
      sendInitiatedAt: '',
    },
  },
]
