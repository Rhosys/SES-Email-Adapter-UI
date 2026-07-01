import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  loginClient: {
    ensureToken: vi.fn().mockResolvedValue('test-token'),
  },
}))

import { api } from '@/lib/api'

function mockFetchResponse(init: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  } as Response
}

describe('api request() error message', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('includes the response status, body title, details, and errorCode when present', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 400,
        body: { title: 'Invalid signal', details: 'Signal is locked by another process', errorCode: 'SIG_INVALID' },
      }),
    )

    const result = await api.reprocessSignal('acc_1', 'sig_1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.status).toBe(400)
      expect(result.error.message).toBe('Invalid signal: Signal is locked by another process (SIG_INVALID) [400]')
    }
  })

  it('omits the details and errorCode segments when the body has neither', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse({ ok: false, status: 500, body: { title: 'Reprocess failed' } }),
    )

    const result = await api.reprocessSignal('acc_1', 'sig_1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toBe('Reprocess failed [500]')
    }
  })

  it('falls back to method/path/status when the body has no title', async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ ok: false, status: 503, body: null }))

    const result = await api.reprocessSignal('acc_1', 'sig_1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toBe('POST /accounts/acc_1/signals/sig_1/reprocess → 503')
    }
  })
})
