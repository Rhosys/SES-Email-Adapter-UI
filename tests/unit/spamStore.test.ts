import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useSpamStore } from '@/stores/spam'
import { useAccountStore } from '@/stores/account'
import type { Signal, BlockedSignal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listBlockedSignals: vi.fn(),
      deleteSignal: vi.fn(),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), critical: vi.fn(), track: vi.fn() },
}))

import { api, ApiError } from '@/lib/api'

function mockSignal(overrides: Partial<Signal> & { signalId?: string; status?: string } = {}): BlockedSignal {
  const { signalId = 'sig_1', status = 'block_hidden', ...rest } = overrides
  return {
    signalId,
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status,
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      receivedAt: '2025-01-01T12:00:00Z',
      summary: 'Test',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'inbox@example.com' }],
      cc: [],
      subject: 'Test subject',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow: 'conversation',
      spamScore: 0,
      matchedRules: [],
    },
    ...rest,
  } as BlockedSignal
}

function mockBothCalls(
  hidItems: BlockedSignal[],
  rejItems: BlockedSignal[],
  hidCursor?: string,
  rejCursor?: string,
) {
  vi.mocked(api.listBlockedSignals)
    .mockResolvedValueOnce(ok({ signals: hidItems, pagination: { cursor: hidCursor ?? null } }))
    .mockResolvedValueOnce(ok({ signals: rejItems, pagination: { cursor: rejCursor ?? null } }))
}

describe('spamStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('blockedCount sums hidden and reject buckets; hasMore reflects either cursor', async () => {
    mockBothCalls(
      [mockSignal({ signalId: 'h1' }), mockSignal({ signalId: 'h2' })],
      [mockSignal({ signalId: 'r1', status: 'block_reject' })],
      'cursor-hidden',
    )
    const store = useSpamStore()
    await store.fetchSignals(true)

    expect(store.blockedCount).toBe(3)
    expect(store.blockedCountHasMore).toBe(true)
  })

  it('blockedCount is 0 and hasMore false when nothing is blocked', async () => {
    mockBothCalls([], [])
    const store = useSpamStore()
    await store.fetchSignals(true)

    expect(store.blockedCount).toBe(0)
    expect(store.blockedCountHasMore).toBe(false)
  })

  it('deleteSignal removes the signal from its bucket and decrements the counter on success', async () => {
    mockBothCalls(
      [mockSignal({ signalId: 'h1' }), mockSignal({ signalId: 'h2' })],
      [mockSignal({ signalId: 'r1', status: 'block_reject' })],
    )
    const store = useSpamStore()
    await store.fetchSignals(true)
    expect(store.blockedCount).toBe(3)

    vi.mocked(api.deleteSignal).mockResolvedValue(ok(undefined))
    const removed = await store.deleteSignal('h1')

    expect(removed).toBe(true)
    expect(api.deleteSignal).toHaveBeenCalledWith('acc_1', 'h1')
    expect(store.blockHidden.map((s) => s.signalId)).toEqual(['h2'])
    expect(store.blockedCount).toBe(2)
    expect(store.actionPending.has('h1')).toBe(false)
  })

  it('deleteSignal keeps the signal and surfaces an error when the API fails', async () => {
    mockBothCalls([mockSignal({ signalId: 'h1' })], [])
    const store = useSpamStore()
    await store.fetchSignals(true)

    vi.mocked(api.deleteSignal).mockResolvedValue(err(new ApiError(500, 'boom')))
    const removed = await store.deleteSignal('h1')

    expect(removed).toBe(false)
    expect(store.error).toBe('boom')
    expect(store.blockHidden.map((s) => s.signalId)).toEqual(['h1'])
    expect(store.blockedCount).toBe(1)
  })
})
