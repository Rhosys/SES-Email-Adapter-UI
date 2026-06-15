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

    const dot = wrapper.find('span.bg-ctp-red')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toBe('Function error')
    expect(dot.attributes('aria-label')).toBe('Has function error')
  })

  it('does not render red dot when no function has lastError', async () => {
    const tpl = mockTemplate({
      functions: [{ name: 'greet', code: '() => "hi"' }],
    })
    const wrapper = await mountView([tpl])

    expect(wrapper.find('span.bg-ctp-red').exists()).toBe(false)
  })

  it('does not render red dot when functions array is empty', async () => {
    const tpl = mockTemplate({ functions: [] })
    const wrapper = await mountView([tpl])

    expect(wrapper.find('span.bg-ctp-red').exists()).toBe(false)
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

    const indicator = wrapper.find('span.text-ctp-peach[title="Last execution error"]')
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

    expect(wrapper.find('.bg-ctp-peach\\/10').exists()).toBe(false)
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
    expect(wrapper.find('span.text-ctp-peach[title="Last execution error"]').exists()).toBe(true)

    // Trigger save to run validation via mocked worker
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save changes')
    await saveBtn!.trigger('click')
    await flushPromises()

    // After validation, the local error indicator (✕) should show
    const localError = wrapper.find('span.text-ctp-red[title="Has error"]')
    expect(localError.exists()).toBe(true)

    // The backend lastError indicator should NOT show (fnErrors takes precedence)
    const backendError = wrapper.find('span.text-ctp-peach[title="Last execution error"]')
    expect(backendError.exists()).toBe(false)
  })
})
