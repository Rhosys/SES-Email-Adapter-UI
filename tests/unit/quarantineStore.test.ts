import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useQuarantineStore } from '@/stores/quarantine'
import type { Signal } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listQuarantined: vi.fn(),
      allowSignal: vi.fn(),
      dismissSignal: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig_1',
    arcId: 'arc_1',
    accountId: 'acc_1',
    status: 'quarantined',
    source: 'ses',
    blockReason: 'new_sender',
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'inbox@example.com' }],
    subject: 'Test subject',
    receivedAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

describe('quarantineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchSignals populates items', async () => {
    vi.mocked(api.listQuarantined).mockResolvedValue(ok({ items: [mockSignal()] }))
    const store = useQuarantineStore()
    await store.fetchSignals('acc_1', true)
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchSignals sets error on failure', async () => {
    vi.mocked(api.listQuarantined).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useQuarantineStore()
    await store.fetchSignals('acc_1', true)
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('fetchSignals resets items when reset=true', async () => {
    vi.mocked(api.listQuarantined).mockResolvedValue(ok({ items: [] }))
    const store = useQuarantineStore()
    store.items = [mockSignal()]
    await store.fetchSignals('acc_1', true)
    expect(store.items).toHaveLength(0)
  })

  it('allow removes signal from list on success', async () => {
    vi.mocked(api.allowSignal).mockResolvedValue(ok(mockSignal({ status: 'received' })))
    const store = useQuarantineStore()
    store.items = [mockSignal({ id: 'sig_1' }), mockSignal({ id: 'sig_2' })]
    const result = await store.allow('acc_1', 'sig_1')
    expect(result).toBe(true)
    expect(store.items.map((s) => s.id)).toEqual(['sig_2'])
  })

  it('allow sets error and returns false on failure', async () => {
    vi.mocked(api.allowSignal).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const store = useQuarantineStore()
    store.items = [mockSignal()]
    const result = await store.allow('acc_1', 'sig_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.items).toHaveLength(1)
  })

  it('dismiss removes signal from list on success', async () => {
    vi.mocked(api.dismissSignal).mockResolvedValue(ok(undefined))
    const store = useQuarantineStore()
    store.items = [mockSignal({ id: 'sig_1' })]
    const result = await store.dismiss('acc_1', 'sig_1', 'spam')
    expect(result).toBe(true)
    expect(store.items).toHaveLength(0)
  })

  it('dismiss sets error and returns false on failure', async () => {
    vi.mocked(api.dismissSignal).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const store = useQuarantineStore()
    store.items = [mockSignal()]
    const result = await store.dismiss('acc_1', 'sig_1', 'spam')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.items).toHaveLength(1)
  })

  it('actionPending tracks in-flight signal ids', async () => {
    let resolve!: () => void
    vi.mocked(api.allowSignal).mockReturnValue(
      new Promise((res) => {
        resolve = () => res(ok(mockSignal()))
      }),
    )
    const store = useQuarantineStore()
    store.items = [mockSignal()]
    const p = store.allow('acc_1', 'sig_1')
    expect(store.actionPending.has('sig_1')).toBe(true)
    resolve()
    await p
    expect(store.actionPending.has('sig_1')).toBe(false)
  })

  it('setFilters merges filter fields', () => {
    const store = useQuarantineStore()
    store.setFilters({ sender: 'test@example.com', blockReason: 'spam' })
    expect(store.filters.sender).toBe('test@example.com')
    expect(store.filters.blockReason).toBe('spam')
    expect(store.filters.after).toBe('')
  })

  it('clearError resets error', () => {
    const store = useQuarantineStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })

  it('nextCursor reflects pagination', async () => {
    vi.mocked(api.listQuarantined).mockResolvedValue(
      ok({ items: [mockSignal()], nextCursor: 'cursor_xyz' }),
    )
    const store = useQuarantineStore()
    await store.fetchSignals('acc_1', true)
    expect(store.nextCursor).toBe('cursor_xyz')
  })
})
