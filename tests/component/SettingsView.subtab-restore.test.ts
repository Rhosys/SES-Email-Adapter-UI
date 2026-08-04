import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '@/views/SettingsView.vue'
import { useAccountStore } from '@/stores/account'
import type { Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listDomains: vi.fn(),
      listForwardingAddresses: vi.fn(),
      listExternalExchanges: vi.fn(),
      listAliases: vi.fn(),
      listTeamMembers: vi.fn(),
      updateAccount: vi.fn(),
      verifyForwardingAddress: vi.fn(),
      getAccount: vi.fn(),
      getBilling: vi.fn(),
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

function testAccount(overrides: Partial<Account> = {}): Account {
  return {
    accountId: 'acc_1',
    name: 'Test',
    filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/:tab', name: 'settings', component: SettingsView },
      { path: '/settings', redirect: '/settings/email-forwarding' },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

function stubApis() {
  vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount()]))
  vi.mocked(api.listDomains).mockResolvedValue(ok([]))
  vi.mocked(api.listForwardingAddresses).mockResolvedValue(ok([]))
  vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
  vi.mocked(api.listAliases).mockResolvedValue(ok([]))
  vi.mocked(api.listTeamMembers).mockResolvedValue(ok([]))
  vi.mocked(api.getAccount).mockResolvedValue(ok(testAccount()))
  vi.mocked(api.getBilling).mockResolvedValue(ok({ plan: 'free', status: 'active' }))
}

async function mountAt(path: string) {
  stubApis()
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(SettingsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('SettingsView — sub-tab restoration on page load', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount()
  })

  // ─── Email & Forwarding sub-tabs ─────────────────────────────────────────────

  describe('Email & Forwarding — sub-tab content renders immediately from URL', () => {
    it('shows Email sub-tab content by default on /settings/email-forwarding', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding')
      expect(wrapper.text()).toContain('After send')
      expect(wrapper.text()).toContain('Data retention')
    })

    it('shows Email sub-tab content from ?tab=email', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=email')
      expect(wrapper.text()).toContain('After send')
      expect(wrapper.text()).toContain('Data retention')
    })

    it('shows Syncing sub-tab content from ?tab=inbound', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=inbound')
      expect(wrapper.text()).toContain('Inbound Receiving')
      expect(wrapper.text()).toContain('Connect')
    })

    it('shows Forwarding sub-tab content from ?tab=forwarding', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=forwarding')
      expect(wrapper.text()).toContain('Outbound Forwarding')
      expect(wrapper.text()).toContain('Calendar invite forwarding')
    })

    it('shows DNS Domains sub-tab content from ?tab=domains', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=domains')
      expect(wrapper.text()).toContain('Add domain')
      expect(wrapper.text()).toContain('No domain connected yet')
    })
  })

  // ─── Profile sub-tabs ────────────────────────────────────────────────────────

  describe('Profile — sub-tab content renders immediately from URL', () => {
    it('shows Configuration sub-tab content by default on /settings/profile', async () => {
      const { wrapper } = await mountAt('/settings/profile')
      expect(wrapper.text()).toContain('Feature tour')
    })

    it('shows Configuration sub-tab content from ?tab=configuration', async () => {
      const { wrapper } = await mountAt('/settings/profile?tab=configuration')
      expect(wrapper.text()).toContain('Feature tour')
    })

    it('shows Security sub-tab content from ?tab=security', async () => {
      const { wrapper } = await mountAt('/settings/profile?tab=security')
      expect(wrapper.text()).toContain('Identity connections')
      expect(wrapper.text()).toContain('Multi-factor authentication')
    })
  })

  // ─── Sub-tab survives the switchTab router.replace ───────────────────────────

  describe('sub-tab query param is preserved after full mount cycle', () => {
    it('inbound sub-tab is still active after all async loading completes', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding?tab=inbound')
      // Flush any remaining microtasks from switchTab's void router.replace
      await flushPromises()
      await router.isReady()
      await flushPromises()
      // The inbound content must still be rendered
      expect(wrapper.text()).toContain('Inbound Receiving')
      // And the URL should retain the sub-tab query
      expect(router.currentRoute.value.query.tab).toBe('inbound')
    })

    it('forwarding sub-tab is still active after all async loading completes', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding?tab=forwarding')
      await flushPromises()
      await router.isReady()
      await flushPromises()
      expect(wrapper.text()).toContain('Outbound Forwarding')
      expect(router.currentRoute.value.query.tab).toBe('forwarding')
    })

    it('domains sub-tab is still active after all async loading completes', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding?tab=domains')
      await flushPromises()
      await router.isReady()
      await flushPromises()
      expect(wrapper.text()).toContain('Add domain')
      expect(router.currentRoute.value.query.tab).toBe('domains')
    })

    it('security sub-tab is still active after all async loading completes', async () => {
      const { wrapper, router } = await mountAt('/settings/profile?tab=security')
      await flushPromises()
      await router.isReady()
      await flushPromises()
      expect(wrapper.text()).toContain('Identity connections')
      expect(router.currentRoute.value.query.tab).toBe('security')
    })
  })
})
