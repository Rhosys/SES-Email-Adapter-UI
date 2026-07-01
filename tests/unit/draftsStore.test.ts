import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { useDraftsStore } from '@/stores/drafts'
import { useThreadsStore } from '@/stores/threads'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import type { Signal, Thread, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listThreads: vi.fn(),
      listSignals: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test thread',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

function mockDraft(overrides: Partial<Signal> & { signalId?: string } = {}): Signal {
  const { signalId = 'sig_draft_1', ...rest } = overrides
  return {
    signalId,
    threadId: 'thread_1',
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

  it('draftCount is 0 when no account is set', () => {
    const accountStore = useAccountStore()
    accountStore.account = null
    const store = useDraftsStore()
    expect(store.draftCount).toBe(0)
  })

  it('refreshTopThreads fetches threads and pulls signals for the top active threads, deriving drafts', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread({ threadId: 'thread_1' })], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({ signals: [mockDraft({ signalId: 'd1' })], pagination: { cursor: null } }),
    )

    const store = useDraftsStore()
    await store.refreshTopThreads()

    expect(api.listSignals).toHaveBeenCalledWith('acc_1', 'thread_1', { limit: 50 })
    expect(store.draftCount).toBe(1)
    expect(store.drafts.map((s) => s.signalId)).toEqual(['d1'])
  })

  it('excludes draft signals belonging to non-active threads', async () => {
    const threadsStore = useThreadsStore()
    const signalsStore = useSignalsStore()
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({
        threads: [mockThread({ threadId: 'thread_active', status: 'active' }), mockThread({ threadId: 'thread_archived', status: 'archived' })],
        pagination: { cursor: null },
      }),
    )
    await threadsStore.fetchThreads(true)

    vi.mocked(api.listSignals).mockImplementation(async (_account, threadId) =>
      ok({
        signals: [mockDraft({ signalId: `draft_${threadId}`, threadId })],
        pagination: { cursor: null },
      }),
    )
    await signalsStore.fetchForThreads(['thread_active', 'thread_archived'])

    const store = useDraftsStore()
    expect(store.drafts.map((s) => s.signalId)).toEqual(['draft_thread_active'])
  })

  it('removeDraft removes a draft from the derived list', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread({ threadId: 'thread_1' })], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({
        signals: [mockDraft({ signalId: 'd1' }), mockDraft({ signalId: 'd2' })],
        pagination: { cursor: null },
      }),
    )
    const store = useDraftsStore()
    await store.refreshTopThreads()
    expect(store.draftCount).toBe(2)

    store.removeDraft('thread_1', 'd1')

    expect(store.drafts.map((s) => s.signalId)).toEqual(['d2'])
    expect(store.draftCount).toBe(1)
  })
})
