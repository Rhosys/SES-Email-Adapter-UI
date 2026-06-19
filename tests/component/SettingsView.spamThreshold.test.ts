import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '@/views/SettingsView.vue'
import { useAccountStore } from '@/stores/account'
import type { Account, Alias } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listAliases: vi.fn(),
      listAliasSenders: vi.fn(),
      updateAlias: vi.fn(),
      updateAccount: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({
  loginClient: {
    getUserIdentity: vi.fn(() => null),
    getUserProfile: vi.fn(() => Promise.resolve({ linkedIdentities: [] })),
    getDevices: vi.fn(() => Promise.resolve([])),
  },
}))

import { api } from '@/lib/api'

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
      { path: '/settings', component: SettingsView },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountEmailsTab(aliases: Alias[]) {
  vi.mocked(api.listAliases).mockResolvedValue(ok(aliases))

  const router = makeRouter()
  await router.push('/settings?tab=emails')
  await router.isReady()

  const wrapper = mount(SettingsView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('SettingsView — spam threshold input', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    vi.mocked(api.updateAccount).mockResolvedValue(ok(testAccount))
    vi.mocked(api.listAliasSenders).mockResolvedValue(ok([]))
  })

  it('displays current spamScoreThreshold value in the input', async () => {
    const alias: Alias = {
      alias: 'inbox',
      address: 'inbox@test.com',
      unknownSenderPolicy: 'allow_all',
      spamScoreThreshold: 5,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    const wrapper = await mountEmailsTab([alias])

    // Expand the alias row to reveal the slider
    const expandBtn = wrapper.find('[aria-label="Toggle details for inbox@test.com"]')
    await expandBtn.trigger('click')
    await flushPromises()

    const aliasList = wrapper.find('.divide-y.divide-ctp-surface0.rounded-lg.border.border-ctp-surface0')
    const slider = aliasList.find('input[type="range"]')
    expect(slider.exists()).toBe(true)
    expect((slider.element as HTMLInputElement).value).toBe('5')
  })

  it('shows placeholder "account default" when threshold is undefined', async () => {
    const alias: Alias = {
      alias: 'inbox',
      address: 'inbox@test.com',
      unknownSenderPolicy: 'allow_all',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    const wrapper = await mountEmailsTab([alias])

    // Expand the alias row to reveal threshold text
    const expandBtn = wrapper.find('[aria-label="Toggle details for inbox@test.com"]')
    await expandBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Using account default threshold')
  })

  it('clamps value to 10 when input exceeds max', async () => {
    const alias: Alias = {
      alias: 'inbox',
      address: 'inbox@test.com',
      unknownSenderPolicy: 'allow_all',
      spamScoreThreshold: 5,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    const updatedAlias: Alias = { ...alias, spamScoreThreshold: 10 }
    vi.mocked(api.updateAlias).mockResolvedValue(ok(updatedAlias))

    const wrapper = await mountEmailsTab([alias])

    // Expand the alias row to reveal the slider
    const expandBtn = wrapper.find('[aria-label="Toggle details for inbox@test.com"]')
    await expandBtn.trigger('click')
    await flushPromises()

    const aliasList = wrapper.find('.divide-y.divide-ctp-surface0.rounded-lg.border.border-ctp-surface0')
    const slider = aliasList.find('input[type="range"]')
    await slider.setValue('10')
    await flushPromises()

    expect(api.updateAlias).toHaveBeenCalledWith('acc_1', 'inbox@test.com', { spamScoreThreshold: 10 })
  })

  it('sends spamScoreThreshold: undefined when input is cleared', async () => {
    const alias: Alias = {
      alias: 'inbox',
      address: 'inbox@test.com',
      unknownSenderPolicy: 'allow_all',
      spamScoreThreshold: 5,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    const updatedAlias: Alias = { ...alias, spamScoreThreshold: undefined }
    vi.mocked(api.updateAlias).mockResolvedValue(ok(updatedAlias))

    const wrapper = await mountEmailsTab([alias])

    // Expand the alias row to reveal the reset button
    const expandBtn = wrapper.find('[aria-label="Toggle details for inbox@test.com"]')
    await expandBtn.trigger('click')
    await flushPromises()

    // Click the "Use account default" button to clear the threshold
    const resetBtn = wrapper.findAll('button').find(b => b.text() === 'Use account default')
    expect(resetBtn).toBeDefined()
    await resetBtn!.trigger('click')
    await flushPromises()

    expect(api.updateAlias).toHaveBeenCalledWith('acc_1', 'inbox@test.com', { spamScoreThreshold: undefined })
  })
})
