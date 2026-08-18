import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import LabelsView from '@/views/LabelsView.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
import type { Label, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listLabels: vi.fn(),
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      listViews: vi.fn(),
      createView: vi.fn(),
      updateView: vi.fn(),
      deleteView: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

function mockLabel(overrides: Partial<Label> = {}): Label {
  return {
    label: 'lbl_1',
    name: 'Newsletters',
    color: '#cba6f7',
    applyInstruction: 'Apply to newsletter emails',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/labels', component: LabelsView }],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView(labels: Label[] = [], views: unknown[] = []) {
  vi.mocked(api.listLabels).mockResolvedValue(ok(labels))
  vi.mocked(api.listViews).mockResolvedValue(ok(views as never[]))
  const router = makeRouter()
  await router.push('/labels')
  await router.isReady()
  const wrapper = mount(LabelsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('LabelsView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows empty state when no labels exist', async () => {
    const wrapper = await mountView([], [])
    expect(wrapper.text()).toContain('No labels yet')
  })

  it('renders label names', async () => {
    const wrapper = await mountView([mockLabel(), mockLabel({ label: 'lbl_2', name: 'Important' })])
    expect(wrapper.text()).toContain('Newsletters')
    expect(wrapper.text()).toContain('Important')
  })

  it('creates a new label via the form', async () => {
    const newLabel = mockLabel({ label: 'lbl_new', name: 'Created' })
    vi.mocked(api.createLabel).mockResolvedValue(ok(newLabel))
    const wrapper = await mountView([])

    await wrapper.findAll('button').find(b => b.text().includes('New label'))!.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#label-name').setValue('Created')
    await wrapper.find('#label-apply-instruction').setValue('Apply to created')
    await wrapper.vm.$nextTick()

    // The Save button is inside the form panel (an AsyncButton)
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(api.createLabel).toHaveBeenCalledWith('acc_1', expect.objectContaining({ name: 'Created' }))
  })

  it('shows error banner on create failure', async () => {
    vi.mocked(api.createLabel).mockResolvedValue(err(new ApiError(500, 'Create failed')))
    const wrapper = await mountView([])

    await wrapper.findAll('button').find(b => b.text().includes('New label'))!.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#label-name').setValue('Failing')
    await wrapper.find('#label-apply-instruction').setValue('Will fail')
    await wrapper.vm.$nextTick()

    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Create failed')
  })

  it('updates an existing label via the edit form', async () => {
    vi.mocked(api.updateLabel).mockResolvedValue(ok(mockLabel({ name: 'Updated' })))
    const wrapper = await mountView([mockLabel()])

    const editBtn = wrapper.findAll('button').find(b => b.text() === 'Edit')!
    await editBtn.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#label-name').setValue('Updated')
    await wrapper.vm.$nextTick()

    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(api.updateLabel).toHaveBeenCalledWith('acc_1', 'lbl_1', expect.objectContaining({ name: 'Updated' }))
  })

  it('deletes a label after confirmation', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValue(ok(undefined as void))
    const wrapper = await mountView([mockLabel()])

    const deleteBtn = wrapper.findAll('button[title="Delete"]')[0]
    await deleteBtn.trigger('click')
    await flushPromises()

    const confirmBtn = wrapper.findAll('button').find(b => b.text() === 'Delete' && b.classes().some(c => c.includes('bg-ctp')))
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(api.deleteLabel).toHaveBeenCalledWith('acc_1', 'lbl_1')
  })
})
