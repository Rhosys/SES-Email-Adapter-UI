import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ThreadResources from '@/components/ThreadResources.vue'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { ok } from 'neverthrow'
import type { Resource } from '@/types/server'

vi.mock('@/lib/api', () => ({
  api: {
    listResourcesByThread: vi.fn(),
    patchResource: vi.fn(),
  },
}))

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

const writeText = vi.fn().mockResolvedValue(undefined)
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

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    vi.mocked(api.listResourcesByThread).mockResolvedValue(
      ok({ resources: [mockResource()], pagination: { cursor: null } }),
    )
  })

  it('does not render a "Resources" text label', async () => {
    const wrapper = await mountResources()
    expect(wrapper.text()).not.toContain('Resources')
  })

  it('shows the overflow menu for non-admin accounts, without a "Show resource" item', async () => {
    const wrapper = await mountResources()
    expect(wrapper.find('[aria-label="Resource actions"]').exists()).toBe(true)
    await wrapper.find('[aria-label="Resource actions"]').trigger('click')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Show resource')).toBe(false)
  })

  it('does not render a standalone complete button — completing lives in the overflow menu', async () => {
    const wrapper = await mountResources()
    expect(wrapper.find('[title="Mark complete"]').exists()).toBe(false)
  })

  it('marks a resource complete from the overflow menu', async () => {
    vi.mocked(api.patchResource).mockResolvedValue(ok(mockResource({ status: 'complete' })))

    const wrapper = await mountResources()
    await wrapper.find('[aria-label="Resource actions"]').trigger('click')

    const completeButton = wrapper.findAll('button').find((b) => b.text() === 'Mark complete')!
    await completeButton.trigger('click')
    await flushPromises()

    expect(api.patchResource).toHaveBeenCalledWith('acc_1', 'res_1', { status: 'complete' })
  })

  it('shows a "Show resource" popup with the resource JSON and a copy button for admins', async () => {
    const accountStore = useAccountStore()
    accountStore.account!.accountId = 'acc-t8cmlkkck3vtm'

    const wrapper = await mountResources()
    await wrapper.find('[aria-label="Resource actions"]').trigger('click')

    const showButton = wrapper.findAll('button').find((b) => b.text() === 'Show resource')!
    await showButton.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Resource object')
    expect(document.body.textContent).toContain('"resourceId": "res_1"')

    const copyButton = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Copy')!
    copyButton.click()
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"resourceId": "res_1"'))
  })
})
