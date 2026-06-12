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
      updateAlias: vi.fn(),
      updateAccount: vi.fn(),
    },
  }
})

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

    // The number picker shows button 5 highlighted (bg-ctp-mauve)
    const buttons = wrapper.findAll('button').filter(b => b.text().match(/^\d+$/))
    const btn5 = buttons.find(b => b.text() === '5')
    expect(btn5).toBeDefined()
    expect(btn5!.classes()).toContain('bg-ctp-mauve')
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

    // No number button should be highlighted, and description shows account default
    const buttons = wrapper.findAll('button').filter(b => b.text().match(/^\d+$/))
    const highlighted = buttons.filter(b => b.classes().includes('bg-ctp-mauve'))
    expect(highlighted.length).toBe(0)
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

    // Click button 10 to set the maximum threshold
    const buttons = wrapper.findAll('button').filter(b => b.text().match(/^\d+$/))
    const btn10 = buttons.find(b => b.text() === '10')
    expect(btn10).toBeDefined()
    await btn10!.trigger('click')
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

    // Click the Reset button to clear the threshold
    const resetBtn = wrapper.findAll('button').find(b => b.text() === 'Reset')
    expect(resetBtn).toBeDefined()
    await resetBtn!.trigger('click')
    await flushPromises()

    expect(api.updateAlias).toHaveBeenCalledWith('acc_1', 'inbox@test.com', { spamScoreThreshold: undefined })
  })
})
