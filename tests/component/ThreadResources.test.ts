import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ThreadResources from '@/components/ThreadResources.vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { ok, err } from 'neverthrow'
import { ApiError } from '@/lib/api'
import type { Resource } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...original,
    api: {
      listResourcesByThread: vi.fn(),
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

async function mountResources() {
  const wrapper = mount(ThreadResources, {
    props: { threadId: 'thread_1' },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('ThreadResources', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }

    vi.mocked(api.listResourcesByThread).mockResolvedValue(
      ok({ resources: [mockResource()], pagination: { cursor: null } }),
    )
  })

  it('renders nothing when no resources exist', async () => {
    vi.mocked(api.listResourcesByThread).mockResolvedValue(
      ok({ resources: [], pagination: { cursor: null } }),
    )
    const wrapper = await mountResources()
    expect(wrapper.find('[role="list"]').exists()).toBe(false)
  })

  it('renders the resource panel when resources exist', async () => {
    const wrapper = await mountResources()
    expect(wrapper.find('[role="list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Package')
  })

  it('does not show a "Jump to thread" link (thread-scoped view)', async () => {
    const wrapper = await mountResources()
    expect(wrapper.text()).not.toContain('Jump to thread')
  })

  it('shows "Mark complete" button for active resources', async () => {
    const wrapper = await mountResources()
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')
    expect(btn).toBeDefined()
  })

  it('marks a resource complete via the toggle button', async () => {
    vi.mocked(api.patchResource).mockResolvedValue(ok(mockResource({ status: 'complete' })))

    const wrapper = await mountResources()
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')!
    await btn.trigger('click')
    await flushPromises()

    expect(api.patchResource).toHaveBeenCalledWith('acc_1', 'res_1', { status: 'complete' })
  })

  it('shows "Completed" badge and "Mark active" for complete resources', async () => {
    vi.mocked(api.listResourcesByThread).mockResolvedValue(
      ok({ resources: [mockResource({ status: 'complete' })], pagination: { cursor: null } }),
    )
    const wrapper = await mountResources()
    expect(wrapper.text()).toContain('Completed')
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark active')
    expect(btn).toBeDefined()
  })

  it('refetches resources when patchResource fails', async () => {
    vi.mocked(api.patchResource).mockResolvedValue(err(new ApiError(500, 'fail')))

    const wrapper = await mountResources()
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')!
    await btn.trigger('click')
    await flushPromises()

    expect(api.listResourcesByThread).toHaveBeenCalledTimes(2)
  })
})
