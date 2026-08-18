import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import TemplatesView from '@/views/TemplatesView.vue'
import { useAccountStore } from '@/stores/account'
import type { EmailTemplate, Account } from '@/types/server'

// Stub Web Worker APIs for jsdom
const mockWorkerPostMessage = vi.fn()
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  postMessage(data: unknown) {
    mockWorkerPostMessage(data)
    // Simulate async response with errors for the validation case
    setTimeout(() => {
      if (this.onmessage && mockWorkerResponse) {
        this.onmessage(new MessageEvent('message', { data: mockWorkerResponse }))
      }
    }, 0)
  }
  terminate() {}
}
let mockWorkerResponse: { outputs: Record<string, string>; errors: Record<string, string> } | null = null

vi.stubGlobal('Worker', MockWorker)
vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listTemplates: vi.fn(),
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
    },
  }
})

vi.mock('@/components/CodeEditor.vue', () => ({
  default: { template: '<div class="code-editor-stub" />', props: ['modelValue'] },
}))

vi.mock('@/components/SignalBrowser.vue', () => ({
  default: { template: '<div class="signal-browser-stub" />', props: ['functions'] },
}))

vi.mock('@/composables/useHbsAutocomplete', () => ({
  useHbsAutocomplete: () => ({
    showPopup: { value: false },
    popupLeft: { value: 0 },
    popupTop: { value: 0 },
    filtered: { value: [] },
    selectedIdx: { value: 0 },
    onInput: vi.fn(),
    onKeydown: vi.fn(),
    close: vi.fn(),
    accept: vi.fn(),
  }),
}))

import { api } from '@/lib/api'

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

function mockTemplate(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    templateId: 'tpl_1',
    name: 'Welcome Email',
    subject: 'Hello {{sender.name}}',
    body: 'Hi there',
    functions: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

let pinia: ReturnType<typeof createPinia>

async function mountView(templates: EmailTemplate[] = []) {
  vi.mocked(api.listTemplates).mockResolvedValue(ok(templates))
  const wrapper = mount(TemplatesView, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

describe('TemplatesView — regression gate CRUD', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    mockWorkerResponse = { outputs: {}, errors: {} }
  })

  it('shows loading skeleton before templates arrive', async () => {
    vi.mocked(api.listTemplates).mockReturnValue(new Promise(() => {}))
    const wrapper = mount(TemplatesView, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="status"][aria-label="Loading templates…"]').exists()).toBe(true)
  })

  it('shows empty state when no templates exist', async () => {
    const wrapper = await mountView([])
    expect(wrapper.text()).toContain('No templates yet')
  })

  it('renders template names after load', async () => {
    const wrapper = await mountView([mockTemplate(), mockTemplate({ templateId: 'tpl_2', name: 'Follow-up' })])
    expect(wrapper.text()).toContain('Welcome Email')
    expect(wrapper.text()).toContain('Follow-up')
  })

  it('creates a new template via the form', async () => {
    vi.mocked(api.createTemplate).mockResolvedValue(ok(mockTemplate({ templateId: 'tpl_new', name: 'New One' })))
    const wrapper = await mountView([])

    await wrapper.findAll('button').find(b => b.text().includes('New template'))!.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#template-name').setValue('New One')
    await wrapper.find('#template-subject').setValue('Subject line')
    await wrapper.vm.$nextTick()

    const createBtn = wrapper.findAll('button').find(b => b.text() === 'Create template')!
    await createBtn.trigger('click')
    await flushPromises()

    expect(api.createTemplate).toHaveBeenCalledWith('acc_1', expect.objectContaining({ name: 'New One', subject: 'Subject line' }))
  })

  it('updates an existing template via the edit form', async () => {
    vi.mocked(api.updateTemplate).mockResolvedValue(ok(mockTemplate({ name: 'Updated' })))
    const wrapper = await mountView([mockTemplate()])

    const editBtn = wrapper.findAll('button').find(b => b.text() === 'Edit')!
    await editBtn.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#template-name').setValue('Updated')
    await wrapper.vm.$nextTick()

    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save changes')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(api.updateTemplate).toHaveBeenCalledWith('acc_1', 'tpl_1', expect.objectContaining({ name: 'Updated' }))
  })

  it('deletes a template after confirmation', async () => {
    vi.mocked(api.deleteTemplate).mockResolvedValue(ok(undefined as void))
    const wrapper = await mountView([mockTemplate()])

    const deleteBtn = wrapper.findAll('button').find(b => b.text() === 'Delete')!
    await deleteBtn.trigger('click')
    await flushPromises()

    const confirmBtn = wrapper.findAll('button').find(b => b.text() === 'Delete' && b.classes().some(c => c.includes('bg-ctp')))
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(api.deleteTemplate).toHaveBeenCalledWith('acc_1', 'tpl_1')
  })
})

describe('TemplatesView — error indicator', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    mockWorkerResponse = { outputs: {}, errors: {} }
  })

  it('renders red dot when a function has lastError', async () => {
    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: '() => "hi"', lastError: 'ReferenceError: x is not defined' }],
    })
    const wrapper = await mountView([tpl])

    const dot = wrapper.find('span[aria-label="Has function error"]')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toBe('Function error')
  })

  it('does not render red dot when no function has lastError', async () => {
    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: '() => "hi"' }],
    })
    const wrapper = await mountView([tpl])

    expect(wrapper.find('span[aria-label="Has function error"]').exists()).toBe(false)
  })

  it('does not render red dot when functions array is empty', async () => {
    const tpl = mockTemplate({ functions: [] })
    const wrapper = await mountView([tpl])

    expect(wrapper.find('span[aria-label="Has function error"]').exists()).toBe(false)
  })

  it('shows lastError indicator in editor when function has lastError and no local validation error', async () => {
    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: '() => "hi"', lastError: 'TypeError: cannot read property' }],
    })
    const wrapper = await mountView([tpl])

    // Open the editor for this template
    const editBtn = wrapper.findAll('button').find((b) => b.text() === 'Edit')
    await editBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('span[title="Last execution error"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.text()).toBe('⚠')
  })

  it('does not show lastError block in editor when function has no lastError', async () => {
    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: '() => "hi"' }],
    })
    const wrapper = await mountView([tpl])

    const editBtn = wrapper.findAll('button').find((b) => b.text() === 'Edit')
    await editBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('span[title="Last execution error"]').exists()).toBe(false)
  })

  it('shows only local validation error when both lastError and fnErrors exist for a function', async () => {
    // Configure mock worker to return a validation error for 'greet'
    mockWorkerResponse = { outputs: { greet: '' }, errors: { greet: 'SyntaxError: Unexpected token' } }

    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: 'invalid code!!', lastError: 'Old backend error' }],
    })
    const wrapper = await mountView([tpl])

    // Open editor
    const editBtn = wrapper.findAll('button').find((b) => b.text() === 'Edit')
    await editBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Before save: backend error indicator is visible (no local error yet)
    expect(wrapper.find('span[title="Last execution error"]').exists()).toBe(true)

    // Trigger save to run validation via mocked worker
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save changes')
    await saveBtn!.trigger('click')
    await flushPromises()

    // After validation, the local error indicator (✕) should show
    const localError = wrapper.find('span[title="Has error"]')
    expect(localError.exists()).toBe(true)

    // The backend lastError indicator should NOT show (fnErrors takes precedence)
    const backendError = wrapper.find('span[title="Last execution error"]')
    expect(backendError.exists()).toBe(false)
  })
})
