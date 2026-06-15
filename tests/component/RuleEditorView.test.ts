import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import RuleEditorView from '@/views/RuleEditorView.vue'
import { useRulesStore } from '@/stores/rules'
import { useAccountStore } from '@/stores/account'
import { useLabelsStore } from '@/stores/labels'
import type { Rule, Account, Label } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listRules: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      listLabels: vi.fn(),
      listTemplates: vi.fn().mockResolvedValue(ok([])),
    },
  }
})

vi.mock('@/stores/quarantine', () => ({
  useQuarantineStore: () => ({
    quarantineVisible: [],
    quarantineHidden: [],
    allow: vi.fn(),
    reject: vi.fn(),
  }),
}))

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

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/rules/new', component: RuleEditorView },
      { path: '/rules/:id', component: RuleEditorView, props: true },
      { path: '/rules', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountEditor(path = '/rules/new') {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RuleEditorView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('RuleEditorView — new rule', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    vi.mocked(api.listLabels).mockResolvedValue(ok([]))
    vi.mocked(api.listRules).mockResolvedValue(ok([]))
  })

  it('renders "New rule" heading', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('New rule')
  })

  it('renders name input', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })

  it('save button is disabled when name is empty', async () => {
    const wrapper = await mountEditor()
    const saveBtn = wrapper.find('button[disabled]')
    expect(saveBtn.exists()).toBe(true)
  })

  it('enabled/disabled toggle changes status', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Enabled')
    const toggleBtn = wrapper.find('button.rounded-full')
    await toggleBtn.trigger('click')
    expect(wrapper.text()).toContain('Disabled')
  })

  it('AND/OR pill toggle switches mode', async () => {
    const wrapper = await mountEditor()
    const orBtn = wrapper.findAll('button').find((b) => b.text() === 'OR')
    expect(orBtn).toBeDefined()
    await orBtn!.trigger('click')
    expect(orBtn!.classes()).toContain('bg-ctp-surface2')
  })

  it('+ Add group button adds a group', async () => {
    const wrapper = await mountEditor()
    const initialGroups = wrapper.findAll(
      '.rounded-lg.border.border-ctp-surface1.bg-ctp-mantle.p-3',
    )
    const initialCount = initialGroups.length
    const addGroupBtn = wrapper.findAll('button').find((b) => b.text() === '+ Add group')
    await addGroupBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    const newGroups = wrapper.findAll('.rounded-lg.border.border-ctp-surface1.bg-ctp-mantle.p-3')
    expect(newGroups.length).toBe(initialCount + 1)
  })

  it('+ Add action shows action picker', async () => {
    const wrapper = await mountEditor()
    const addActionBtn = wrapper.findAll('button').find((b) => b.text() === '+ Add action')
    await addActionBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    expect(selects.length).toBeGreaterThan(0)
  })

  it('calls createRule on save with correct body', async () => {
    const createdRule = mockRule({ ruleId: 'new_1', name: 'My Rule' })
    vi.mocked(api.createRule).mockResolvedValue(ok(createdRule))

    const wrapper = await mountEditor()

    await wrapper.find('input[placeholder="e.g. Block marketing emails"]').setValue('My Rule')
    await wrapper.find('input[placeholder="value"]').setValue('spam@evil.com')

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Create rule')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(api.createRule).toHaveBeenCalledWith(
      'acc_1',
      expect.objectContaining({
        name: 'My Rule',
        actions: expect.arrayContaining([expect.objectContaining({ type: 'block_hidden' })]),
        condition: expect.any(String),
      }),
    )
  })

  it('shows rule tester section', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Rule tester')
  })

  it('run test shows match for matching address', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('input[placeholder="value"]').setValue('spam@evil.com')
    // Open the accordion
    const details = wrapper.find('details')
    ;(details.element as HTMLDetailsElement).open = true
    details.element.dispatchEvent(new Event('toggle'))
    await wrapper.vm.$nextTick()
    await wrapper.find('input[placeholder="user@example.com"]').setValue('spam@evil.com')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Rule matches this email')
  })

  it('run test shows no match for different address', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('input[placeholder="value"]').setValue('spam@evil.com')
    // Open the accordion
    const details = wrapper.find('details')
    ;(details.element as HTMLDetailsElement).open = true
    details.element.dispatchEvent(new Event('toggle'))
    await wrapper.vm.$nextTick()
    await wrapper.find('input[placeholder="user@example.com"]').setValue('good@safe.com')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Rule does not match')
  })
})

describe('RuleEditorView — edit existing rule', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    vi.mocked(api.listLabels).mockResolvedValue(ok([]))
  })

  it('renders "Edit rule" heading when editing', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')
    expect(wrapper.text()).toContain('Edit rule')
  })

  it('pre-fills name from existing rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule({ name: 'Existing Rule' })]))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')
    const nameInput = wrapper.find('input[placeholder="e.g. Block marketing emails"]')
      .element as HTMLInputElement
    expect(nameInput.value).toBe('Existing Rule')
  })

  it('shows "Save changes" button when editing', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')
    expect(wrapper.text()).toContain('Save changes')
  })

  it('calls updateRule (not createRule) on save', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    vi.mocked(api.updateRule).mockResolvedValue(ok(mockRule({ name: 'Updated' })))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save changes')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(api.updateRule).toHaveBeenCalled()
    expect(api.createRule).not.toHaveBeenCalled()
  })

  it('pre-fills disabled status from existing rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule({ status: 'disabled' })]))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')
    expect(wrapper.text()).toContain('Disabled')
  })

  it('pre-fills condition from existing rule', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    await useRulesStore().fetchRules()
    const wrapper = await mountEditor('/rules/rule_1')
    const valueInput = wrapper.find('input[placeholder="value"]').element as HTMLInputElement
    expect(valueInput.value).toBe('spam@evil.com')
  })
})

describe('RuleEditorView — assign_label action', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows label select with label name when assign_label action is present', async () => {
    const label: Label = {
      label: 'lbl_1',
      name: 'VIP',
      createdAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listLabels).mockResolvedValue(ok([label]))
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ actions: [{ type: 'assign_label', value: 'lbl_1' }] })]),
    )

    await useRulesStore().fetchRules()
    await useLabelsStore().fetchLabels()
    const wrapper = await mountEditor('/rules/rule_1')

    expect(wrapper.text()).toContain('Assign label')
    expect(wrapper.text()).toContain('VIP')
  })
})
