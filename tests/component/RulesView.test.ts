import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import RulesView from '@/views/RulesView.vue'
import { useRulesStore } from '@/stores/rules'
import { useAccountStore } from '@/stores/account'
import type { Rule, Account } from '@/types/server'
import { ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listRules: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      createRule: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockRule(overrides: Partial<Rule> = {}): Rule {
  return {
    ruleId: 'rule_1',
    name: 'Block spam',
    status: 'enabled',
    priorityOrder: 1,
    condition: '{"==":[{"var":"signal.from.address"},"spam@evil.com"]}',
    actions: [{ type: 'block_hidden' }],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

let pinia: ReturnType<typeof createPinia>

function mountView() {
  return mount(RulesView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: RouterLinkStub, TransitionGroup: false },
    },
  })
}

describe('RulesView', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    // default: empty rules list so onMounted doesn't interfere per-test
    vi.mocked(api.listRules).mockResolvedValue(ok([]))
  })

  it('renders rule name', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Block spam')
  })

  it('renders action badge for each action', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ actions: [{ type: 'block_hidden' }, { type: 'archive' }] })]),
    )
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Block')
    expect(wrapper.text()).toContain('Archive')
  })

  it('shows "disabled" badge for disabled rules', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule({ status: 'disabled' })]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('disabled')
  })

  it('shows decoded condition summary', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('signal.from.address')
    expect(wrapper.text()).toContain('spam@evil.com')
  })

  it('shows empty state when no rules', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Every email handled on autopilot')
  })

  it('shows error banner when store has error', async () => {
    const wrapper = mountView()
    await flushPromises()
    useRulesStore().error = 'Something went wrong'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('dismiss clears error', async () => {
    const wrapper = mountView()
    await flushPromises()
    const store = useRulesStore()
    store.error = 'Something went wrong'
    await wrapper.vm.$nextTick()
    await wrapper.find('button.underline').trigger('click')
    expect(store.error).toBeNull()
  })

  it('shows error banner on fetch failure', async () => {
    vi.mocked(api.listRules).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Server error')
  })

  it('▲ button is disabled for the first rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'r1', priorityOrder: 1 }), mockRule({ ruleId: 'r2', priorityOrder: 2 })]),
    )
    const wrapper = mountView()
    await flushPromises()
    const upButtons = wrapper.findAll('button[aria-label="Move rule up"]')
    expect((upButtons[0].element as HTMLButtonElement).disabled).toBe(true)
    expect((upButtons[1].element as HTMLButtonElement).disabled).toBe(false)
  })

  it('▼ button is disabled for the last rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'r1', priorityOrder: 1 }), mockRule({ ruleId: 'r2', priorityOrder: 2 })]),
    )
    const wrapper = mountView()
    await flushPromises()
    const downButtons = wrapper.findAll('button[aria-label="Move rule down"]')
    expect((downButtons[0].element as HTMLButtonElement).disabled).toBe(false)
    expect((downButtons[1].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls moveRule when ▲ is clicked on second rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'r1', priorityOrder: 1 }), mockRule({ ruleId: 'r2', priorityOrder: 2 })]),
    )
    vi.mocked(api.updateRule).mockResolvedValue(ok(mockRule({ ruleId: 'r2', priorityOrder: 1 })))
    const wrapper = mountView()
    await flushPromises()
    const upButtons = wrapper.findAll('button[aria-label="Move rule up"]')
    await upButtons[1].trigger('click')
    expect(api.updateRule).toHaveBeenCalled()
  })

  it('calls reorderRule on drop', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'r1', priorityOrder: 1 }), mockRule({ ruleId: 'r2', priorityOrder: 2 })]),
    )
    vi.mocked(api.updateRule).mockResolvedValue(ok(mockRule({ ruleId: 'r1', priorityOrder: 2 })))
    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[draggable="true"]')
    await rows[0].trigger('dragstart')
    await rows[1].trigger('drop')
    await flushPromises()
    expect(api.updateRule).toHaveBeenCalled()
  })

  it('calls deleteRule after confirm', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    vi.mocked(api.deleteRule).mockResolvedValue(ok(undefined))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button.text-ctp-red').trigger('click')
    expect(api.deleteRule).toHaveBeenCalledWith('acc_1', 'rule_1')
    vi.unstubAllGlobals()
  })

  it('does not call deleteRule when confirm is cancelled', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button.text-ctp-red').trigger('click')
    expect(api.deleteRule).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('renders correct position numbers for two rules', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'r1', priorityOrder: 1 }), mockRule({ ruleId: 'r2', priorityOrder: 2 })]),
    )
    const wrapper = mountView()
    await flushPromises()
    const posSpans = wrapper.findAll('span.text-xs.text-ctp-surface2')
    expect(posSpans[0].text()).toBe('1')
    expect(posSpans[1].text()).toBe('2')
  })
})
