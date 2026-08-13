import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import ResourcesView from '@/views/ResourcesView.vue'
import { useAccountStore } from '@/stores/account'
import type { Resource } from '@/types/server'

vi.mock('@/lib/api', () => ({
  api: {
    listResources: vi.fn(),
    patchResource: vi.fn(),
  },
}))

import { api } from '@/lib/api'

function mockResource(overrides: Partial<Resource> = {}): Resource {
  return {
    resourceId: 'res_1',
    threadId: 'thread_1',
    workflow: 'package',
    status: 'active',
    expectedResolutionDate: '2026-08-20',
    assets: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/resources', component: ResourcesView },
      { path: '/threads/:id', name: 'thread-detail', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/resources')
  await router.isReady()
  const wrapper = mount(ResourcesView, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('ResourcesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('fetches all resources regardless of status', async () => {
    vi.mocked(api.listResources).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))
    await mountView()
    expect(api.listResources).toHaveBeenCalledWith('acc_1', { limit: 100 })
  })

  it('renders the empty state when there are no resources', async () => {
    vi.mocked(api.listResources).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No resources here')
  })

  it('renders active resources by default and a jump-to-thread link', async () => {
    vi.mocked(api.listResources).mockResolvedValue(
      ok({ resources: [mockResource()], pagination: { cursor: null } }),
    )
    const wrapper = await mountView()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)
    const link = wrapper.find('a[href="/threads/thread_1"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Jump to thread')
  })

  it('hides completed resources under the Active tab and shows them under Complete', async () => {
    vi.mocked(api.listResources).mockResolvedValue(
      ok({
        resources: [mockResource({ resourceId: 'res_active' }), mockResource({ resourceId: 'res_done', status: 'complete' })],
        pagination: { cursor: null },
      }),
    )
    const wrapper = await mountView()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)

    const completeTab = wrapper.findAll('button').find((b) => b.text() === 'Complete')!
    await completeTab.trigger('click')

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Mark active')
  })

  it('toggles a resource status via the Mark complete / Mark active button', async () => {
    vi.mocked(api.listResources).mockResolvedValue(
      ok({ resources: [mockResource()], pagination: { cursor: null } }),
    )
    vi.mocked(api.patchResource).mockResolvedValue(ok(mockResource({ status: 'complete' })))
    const wrapper = await mountView()

    const toggleButton = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')!
    await toggleButton.trigger('click')
    await flushPromises()

    expect(api.patchResource).toHaveBeenCalledWith('acc_1', 'res_1', { status: 'complete' })
  })
})
