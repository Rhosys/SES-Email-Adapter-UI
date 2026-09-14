import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import ThreadResources from '@/components/ThreadResources.vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { ok } from 'neverthrow'
import type { Resource } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...original,
    api: {
      patchResource: vi.fn(),
    },
  }
})

function mockResource(overrides: Partial<Resource> = {}): Resource {
  return {
    resourceId: 'res_1',
    threadId: 'thread_1',
    workflow: 'package',
    status: 'active',
    expectedResolutionDate: '2026-08-20T00:00:00Z',
    assets: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

let pinia: ReturnType<typeof createPinia>
let queryClient: QueryClient

function mountResources(resources: Resource[]) {
  return mount(ThreadResources, {
    props: { resources },
    global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
}

describe('ThreadResources', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }

    vi.mocked(api.patchResource).mockResolvedValue(ok(mockResource({ status: 'complete' })))
  })

  it('renders nothing when no resources exist', () => {
    const wrapper = mountResources([])
    expect(wrapper.find('[role="list"]').exists()).toBe(false)
  })

  it('renders the resource panel when resources exist', () => {
    const wrapper = mountResources([mockResource()])
    expect(wrapper.find('[role="list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Package')
  })

  it('does not show a "Jump to thread" link (thread-scoped view)', () => {
    const wrapper = mountResources([mockResource()])
    expect(wrapper.text()).not.toContain('Jump to thread')
  })

  it('shows "Mark complete" button for active resources', () => {
    const wrapper = mountResources([mockResource()])
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')
    expect(btn).toBeDefined()
  })

  it('marks a resource complete via the toggle button', async () => {
    const wrapper = mountResources([mockResource()])
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')!
    await btn.trigger('click')
    await flushPromises()

    expect(api.patchResource).toHaveBeenCalledWith('acc_1', 'res_1', { status: 'complete' })
  })

  it('shows "Completed" badge and "Mark active" for complete resources', () => {
    const wrapper = mountResources([mockResource({ status: 'complete' })])
    expect(wrapper.text()).toContain('Completed')
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark active')
    expect(btn).toBeDefined()
  })
})
