import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useQuarantineStore } from '@/stores/quarantine'
import type { Arc } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listArcs: vi.fn(),
      allowSender: vi.fn(),
      blockSender: vi.fn(),
    },
  }
})

vi.mock('@/stores/account', () => ({
  useAccountStore: () => ({
    account: { emailConfigs: {} },
    accountId: 'acc_1',
  }),
}))

import { api, ApiError } from '@/lib/api'

function mockArc(overrides: Partial<Arc> = {}): Arc {
  return {
    id: 'arc_1',
    accountId: 'acc_1',
    workflow: 'conversation',
    labels: ['system:sender:untrusted'],
    status: 'quarantined',
    summary: 'Untrusted sender email',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T12:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    senderAddress: 'sender@example.com',
    recipientAddress: 'inbox@example.com',
    ...overrides,
  }
}

describe('quarantineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchArcs populates items', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [mockArc()] }))
    const store = useQuarantineStore()
    await store.fetchArcs('acc_1', true)
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchArcs sets error on failure', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useQuarantineStore()
    await store.fetchArcs('acc_1', true)
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('fetchArcs resets items when reset=true', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [] }))
    const store = useQuarantineStore()
    store.items = [mockArc()]
    await store.fetchArcs('acc_1', true)
    expect(store.items).toHaveLength(0)
  })

  it('fetchArcs passes status=quarantined in params', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [] }))
    const store = useQuarantineStore()
    await store.fetchArcs('acc_1', true)
    expect(vi.mocked(api.listArcs)).toHaveBeenCalledWith(
      'acc_1',
      expect.objectContaining({ status: 'quarantined' }),
    )
  })

  it('allowSender removes arc from list on success', async () => {
    vi.mocked(api.allowSender).mockResolvedValue(
      ok({
        id: 'alias_1',
        accountId: 'acc_1',
        address: 'inbox@example.com',
        filterMode: 'strict',
        approvedSenders: ['sender@example.com'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }),
    )
    const store = useQuarantineStore()
    store.items = [mockArc({ id: 'arc_1' }), mockArc({ id: 'arc_2' })]
    const result = await store.allowSender('acc_1', 'arc_1')
    expect(result).toBe(true)
    expect(store.items.map((a) => a.id)).toEqual(['arc_2'])
  })

  it('allowSender sets error and returns false on failure', async () => {
    vi.mocked(api.allowSender).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const store = useQuarantineStore()
    store.items = [mockArc()]
    const result = await store.allowSender('acc_1', 'arc_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.items).toHaveLength(1)
  })

  it('allowSender returns false if arc is missing address fields', async () => {
    const store = useQuarantineStore()
    store.items = [mockArc({ senderAddress: undefined, recipientAddress: undefined })]
    const result = await store.allowSender('acc_1', 'arc_1')
    expect(result).toBe(false)
    expect(store.error).toBeTruthy()
  })

  it('blockSender removes arc from list on success', async () => {
    vi.mocked(api.blockSender).mockResolvedValue(
      ok({
        id: 'alias_1',
        accountId: 'acc_1',
        address: 'inbox@example.com',
        filterMode: 'strict',
        approvedSenders: [],
        blockedSenders: ['sender@example.com'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }),
    )
    const store = useQuarantineStore()
    store.items = [mockArc({ id: 'arc_1' })]
    const result = await store.blockSender('acc_1', 'arc_1')
    expect(result).toBe(true)
    expect(store.items).toHaveLength(0)
  })

  it('blockSender sets error and returns false on failure', async () => {
    vi.mocked(api.blockSender).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const store = useQuarantineStore()
    store.items = [mockArc()]
    const result = await store.blockSender('acc_1', 'arc_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.items).toHaveLength(1)
  })

  it('actionPending tracks in-flight arc ids', async () => {
    let resolve!: () => void
    vi.mocked(api.allowSender).mockReturnValue(
      new Promise((res) => {
        resolve = () =>
          res(
            ok({
              id: 'alias_1',
              accountId: 'acc_1',
              address: 'inbox@example.com',
              filterMode: 'strict',
              approvedSenders: ['sender@example.com'],
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            }),
          )
      }),
    )
    const store = useQuarantineStore()
    store.items = [mockArc()]
    const p = store.allowSender('acc_1', 'arc_1')
    expect(store.actionPending.has('arc_1')).toBe(true)
    resolve()
    await p
    expect(store.actionPending.has('arc_1')).toBe(false)
  })

  it('setFilters merges filter fields', () => {
    const store = useQuarantineStore()
    store.setFilters({ sender: 'test@example.com', after: '2025-01-01' })
    expect(store.filters.sender).toBe('test@example.com')
    expect(store.filters.after).toBe('2025-01-01')
    expect(store.filters.before).toBe('')
  })

  it('clearError resets error', () => {
    const store = useQuarantineStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })

  it('nextCursor reflects pagination', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [mockArc()], nextCursor: 'cursor_xyz' }))
    const store = useQuarantineStore()
    await store.fetchArcs('acc_1', true)
    expect(store.nextCursor).toBe('cursor_xyz')
  })
})
