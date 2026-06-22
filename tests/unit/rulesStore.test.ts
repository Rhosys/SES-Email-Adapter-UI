import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useRulesStore } from '@/stores/rules'
import { useAccountStore } from '@/stores/account'
import type { Rule, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listRules: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockRule(overrides: Partial<Rule> = {}): Rule {
  return {
    ruleId: 'rule_1',
    name: 'Test rule',
    status: 'enabled',
    priorityOrder: 1,
    condition: '{"==":[{"var":"signal.from.address"},"spam@example.com"]}',
    actions: [{ type: 'block_hidden' }],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('rulesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchRules populates items', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    const store = useRulesStore()
    await store.fetchRules()
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchRules sets error on failure', async () => {
    vi.mocked(api.listRules).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useRulesStore()
    await store.fetchRules()
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('createRule adds item and returns it', async () => {
    const rule = mockRule({ ruleId: 'rule_2', name: 'New rule' })
    vi.mocked(api.createRule).mockResolvedValue(ok(rule))
    const store = useRulesStore()
    const result = await store.createRule({
      name: 'New rule',
      condition: '{}',
      actions: [{ type: 'block_hidden' }],
    })
    expect(result.isOk()).toBe(true)
    expect(result.isOk() && result.value).toEqual(rule)
    expect(store.items).toHaveLength(1)
  })

  it('createRule sets error and returns err on failure', async () => {
    vi.mocked(api.createRule).mockResolvedValue(err(new ApiError(400, 'Invalid')))
    const store = useRulesStore()
    const result = await store.createRule({ name: 'x', condition: '{}', actions: [] })
    expect(result.isErr()).toBe(true)
    expect(store.error).toBe('Invalid')
  })

  it('updateRule replaces item in list', async () => {
    const updated = mockRule({ name: 'Updated rule' })
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    vi.mocked(api.updateRule).mockResolvedValue(ok(updated))
    const store = useRulesStore()
    await store.fetchRules()
    const result = await store.updateRule('rule_1', { name: 'Updated rule' })
    expect(result.isOk() && result.value.name).toBe('Updated rule')
    expect(store.items[0].name).toBe('Updated rule')
  })

  it('deleteRule removes item from list', async () => {
    vi.mocked(api.listRules).mockResolvedValue(
      ok([mockRule({ ruleId: 'rule_1' }), mockRule({ ruleId: 'rule_2' })]),
    )
    vi.mocked(api.deleteRule).mockResolvedValue(ok(undefined))
    const store = useRulesStore()
    await store.fetchRules()
    const result = await store.deleteRule('rule_1')
    expect(result.isOk()).toBe(true)
    expect(store.items.map((r) => r.ruleId)).toEqual(['rule_2'])
  })

  it('deleteRule sets error and returns err on failure', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    vi.mocked(api.deleteRule).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useRulesStore()
    await store.fetchRules()
    const result = await store.deleteRule('rule_1')
    expect(result.isErr()).toBe(true)
    expect(store.error).toBe('Server error')
    expect(store.items).toHaveLength(1)
  })

  it('deleteRule on 404 removes item from cache', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    vi.mocked(api.deleteRule).mockResolvedValue(err(new ApiError(404, 'Not found')))
    const store = useRulesStore()
    await store.fetchRules()
    const result = await store.deleteRule('rule_1')
    expect(result.isOk()).toBe(true)
    expect(store.error).toBeNull()
    expect(store.items).toHaveLength(0)
  })

  it('clearError resets error', () => {
    const store = useRulesStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })

  it('savePending is true during API call', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof api.createRule>>) => void
    vi.mocked(api.createRule).mockReturnValue(
      new Promise((res) => {
        resolve = res
      }),
    )
    const store = useRulesStore()
    const p = store.createRule({ name: 'x', condition: '{}', actions: [] })
    expect(store.savePending).toBe(true)
    resolve(ok(mockRule()))
    await p
    expect(store.savePending).toBe(false)
  })
})
