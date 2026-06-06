import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import ArcDetailView from '@/views/ArcDetailView.vue'
import { useAccountStore } from '@/stores/account'
import type { Arc } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getArc: vi.fn(),
      listSignals: vi.fn(),
      patchArc: vi.fn(),
      listAccounts: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function makeArc(overrides: Partial<Arc> = {}): Arc {
  return {
    arcId: 'arc_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test thread',
    lastSignalAt: '2025-06-01T00:00:00Z',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/arcs/:id', component: ArcDetailView },
      { path: '/', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView(arc: Arc) {
  vi.mocked(api.getArc).mockResolvedValue(ok(arc))
  vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))

  const router = makeRouter()
  await router.push(`/arcs/${arc.arcId}`)
  await router.isReady()

  const wrapper = mount(ArcDetailView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('ArcDetailView — deleted timestamp display', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows "Deleted on" date when status is deleted and deletedAt is set', async () => {
    const arc = makeArc({
      status: 'deleted',
      deletedAt: '2025-06-15T10:30:00Z',
    })
    const wrapper = await mountView(arc)

    const formatted = new Date('2025-06-15T10:30:00Z').toLocaleDateString(undefined, { dateStyle: 'medium' })
    expect(wrapper.text()).toContain(`Deleted on ${formatted}`)
  })

  it('does not show deletion date when status is deleted but deletedAt is absent', async () => {
    const arc = makeArc({ status: 'deleted' })
    const wrapper = await mountView(arc)

    expect(wrapper.text()).not.toContain('Deleted on')
  })

  it('does not show deletion date when status is active even if deletedAt is set', async () => {
    const arc = makeArc({
      status: 'active',
      deletedAt: '2025-06-15T10:30:00Z',
    })
    const wrapper = await mountView(arc)

    expect(wrapper.text()).not.toContain('Deleted on')
  })
})
