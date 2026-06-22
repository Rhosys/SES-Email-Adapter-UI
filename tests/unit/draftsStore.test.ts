import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useDraftsStore } from '@/stores/drafts'
import { useAccountStore } from '@/stores/account'
import type { Signal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listDraftSignals: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockDraft(overrides: Partial<Signal> & { signalId?: string } = {}): Signal {
  const { signalId = 'sig_draft_1', ...rest } = overrides
  return {
    signalId,
    arcId: 'arc_1',
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      from: { address: 'me@example.com' },
      to: [{ address: 'them@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Test draft',
      body: 'Draft body',
      attachments: [],
      sendInitiatedAt: '',
    },
    ...rest,
  } as Signal
}

describe('draftsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchDrafts populates drafts and count', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({ signals: [mockDraft({ signalId: 'd1' }), mockDraft({ signalId: 'd2' })], pagination: { cursor: null } }),
    )
    const store = useDraftsStore()
    await store.fetchDrafts(true)

    expect(store.draftCount).toBe(2)
    expect(store.drafts.map((s) => s.signalId)).toEqual(['d1', 'd2'])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('draftCountHasMore reflects pagination cursor', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({ signals: [mockDraft()], pagination: { cursor: 'cur_1' } }),
    )
    const store = useDraftsStore()
    await store.fetchDrafts(true)

    expect(store.draftCountHasMore).toBe(true)
    expect(store.hasMore).toBe(true)
  })

  it('fetchDrafts sets error on failure when no cache exists', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useDraftsStore()
    await store.fetchDrafts(true)

    expect(store.error).toBe('Server error')
    expect(store.draftCount).toBe(0)
  })

  it('draftCount is 0 when no account is set', () => {
    const accountStore = useAccountStore()
    accountStore.account = null
    const store = useDraftsStore()
    expect(store.draftCount).toBe(0)
  })

  it('removeDraft removes a draft from the cached list', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({ signals: [mockDraft({ signalId: 'd1' }), mockDraft({ signalId: 'd2' })], pagination: { cursor: null } }),
    )
    const store = useDraftsStore()
    await store.fetchDrafts(true)

    store.removeDraft('d1')
    expect(store.drafts.map((s) => s.signalId)).toEqual(['d2'])
    expect(store.draftCount).toBe(1)
  })

  it('fetchMoreDrafts appends results and advances cursor', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValueOnce(
      ok({ signals: [mockDraft({ signalId: 'd1' })], pagination: { cursor: 'cur_1' } }),
    )
    const store = useDraftsStore()
    await store.fetchDrafts(true)

    vi.mocked(api.listDraftSignals).mockResolvedValueOnce(
      ok({ signals: [mockDraft({ signalId: 'd2' })], pagination: { cursor: null } }),
    )
    await store.fetchMoreDrafts()

    expect(vi.mocked(api.listDraftSignals)).toHaveBeenLastCalledWith('acc_1', { cursor: 'cur_1', limit: 50 })
    expect(store.drafts.map((s) => s.signalId)).toEqual(['d1', 'd2'])
    expect(store.hasMore).toBe(false)
  })

  it('clearError resets error', () => {
    const store = useDraftsStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })
})
