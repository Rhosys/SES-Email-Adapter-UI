import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  loginClient: {
    ensureToken: vi.fn().mockResolvedValue('test-token'),
  },
}))

import { api } from '@/lib/api'

describe('api.rsvpSignal', () => {
  it('sends the decision under the "decision" key the backend expects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await api.rsvpSignal('acc_1', 'thread_1', 'sig_1', 'accepted')

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ decision: 'accepted' })
  })
})
