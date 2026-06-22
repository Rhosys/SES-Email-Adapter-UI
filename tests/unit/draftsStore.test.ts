import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { useDraftsStore } from '@/stores/drafts'
import { useArcsStore } from '@/stores/arcs'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import type { Signal, Arc, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listArcs: vi.fn(),
      listSignals: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockArc(overrides: Partial<Arc> = {}): Arc {
  return {
    arcId: 'arc_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test arc',
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

  it('draftCount is 0 when no account is set', () => {
    const accountStore = useAccountStore()
    accountStore.account = null
    const store = useDraftsStore()
    expect(store.draftCount).toBe(0)
  })

  it('refreshTopArcs fetches arcs and pulls signals for the top active arcs, deriving drafts', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ arcs: [mockArc({ arcId: 'arc_1' })], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({ signals: [mockDraft({ signalId: 'd1' })], pagination: { cursor: null } }),
    )

    const store = useDraftsStore()
    await store.refreshTopArcs()

    expect(api.listSignals).toHaveBeenCalledWith('acc_1', 'arc_1', { limit: 50 })
    expect(store.draftCount).toBe(1)
    expect(store.drafts.map((s) => s.signalId)).toEqual(['d1'])
  })

  it('excludes draft signals belonging to non-active arcs', async () => {
    const arcsStore = useArcsStore()
    const signalsStore = useSignalsStore()
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({
        arcs: [mockArc({ arcId: 'arc_active', status: 'active' }), mockArc({ arcId: 'arc_archived', status: 'archived' })],
        pagination: { cursor: null },
      }),
    )
    await arcsStore.fetchArcs(true)

    vi.mocked(api.listSignals).mockImplementation(async (_account, arcId) =>
      ok({
        signals: [mockDraft({ signalId: `draft_${arcId}`, arcId })],
        pagination: { cursor: null },
      }),
    )
    await signalsStore.fetchForArcs(['arc_active', 'arc_archived'])

    const store = useDraftsStore()
    expect(store.drafts.map((s) => s.signalId)).toEqual(['draft_arc_active'])
  })

  it('removeDraft removes a draft from the derived list', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ arcs: [mockArc({ arcId: 'arc_1' })], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({
        signals: [mockDraft({ signalId: 'd1' }), mockDraft({ signalId: 'd2' })],
        pagination: { cursor: null },
      }),
    )
    const store = useDraftsStore()
    await store.refreshTopArcs()
    expect(store.draftCount).toBe(2)

    store.removeDraft('arc_1', 'd1')

    expect(store.drafts.map((s) => s.signalId)).toEqual(['d2'])
    expect(store.draftCount).toBe(1)
  })
})
