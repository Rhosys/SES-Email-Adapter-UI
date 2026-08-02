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
      { path: '/settings', redirect: '/settings/profile' },
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

describe('SettingsView — routing', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount()
  })

  // ─── Direct page load (path segment) ────────────────────────────────────────

  describe('direct page load from path segment', () => {
    it('loads the profile tab from /settings/profile', async () => {
      const { wrapper } = await mountAt('/settings/profile')
      expect(wrapper.text()).toContain('Configuration')
      expect(wrapper.text()).toContain('Security')
    })

    it('loads the emails tab from /settings/emails', async () => {
      const { wrapper } = await mountAt('/settings/emails')
      expect(wrapper.text()).toContain('Aliases')
    })

    it('loads the email-forwarding tab from /settings/email-forwarding', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding')
      // The sub-tab buttons should be visible
      expect(wrapper.text()).toContain('Email')
      expect(wrapper.text()).toContain('Inbound')
      expect(wrapper.text()).toContain('Forwarding')
      expect(wrapper.text()).toContain('Domains')
    })

    it('loads the team tab from /settings/team', async () => {
      const { wrapper } = await mountAt('/settings/team')
      expect(wrapper.text()).toContain('Team')
    })

    it('loads the billing tab from /settings/billing', async () => {
      const { wrapper } = await mountAt('/settings/billing')
      expect(wrapper.text()).toContain('Billing')
    })
  })

  // ─── Sub-tab deep linking via ?tab= query ───────────────────────────────────

  describe('sub-tab deep linking via ?tab= query', () => {
    it('activates forwarding sub-tab from /settings/email-forwarding?tab=forwarding', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=forwarding')
      // The forwarding sub-tab content should be visible (Add Forwarding Target button)
      expect(wrapper.text()).toContain('Forwarding')
    })

    it('activates domains sub-tab from /settings/email-forwarding?tab=domains', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=domains')
      expect(wrapper.text()).toContain('Domains')
    })

    it('activates inbound sub-tab from /settings/email-forwarding?tab=inbound', async () => {
      const { wrapper } = await mountAt('/settings/email-forwarding?tab=inbound')
      expect(wrapper.text()).toContain('Inbound')
    })

    it('activates security sub-tab from /settings/profile?tab=security', async () => {
      const { wrapper } = await mountAt('/settings/profile?tab=security')
      expect(wrapper.text()).toContain('Security')
    })

    it('activates configuration sub-tab from /settings/profile?tab=configuration', async () => {
      const { wrapper } = await mountAt('/settings/profile?tab=configuration')
      expect(wrapper.text()).toContain('Configuration')
    })
  })

  // ─── Tab navigation updates the URL ─────────────────────────────────────────

  describe('tab navigation updates the URL', () => {
    it('switching from profile to emails updates path to /settings/emails', async () => {
      const { wrapper, router } = await mountAt('/settings/profile')

      const emailsTab = wrapper.findAll('button').find((b) => b.text().trim() === 'Aliases')
      expect(emailsTab).toBeDefined()
      await emailsTab!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/emails')
    })

    it('switching from profile to email-forwarding updates path to /settings/email-forwarding', async () => {
      const { wrapper, router } = await mountAt('/settings/profile')

      const efTab = wrapper.findAll('button').find((b) => b.text().trim() === 'Email & Forwarding')
      expect(efTab).toBeDefined()
      await efTab!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/email-forwarding')
    })

    it('switching from profile to team updates path to /settings/team', async () => {
      const { wrapper, router } = await mountAt('/settings/profile')

      const teamTab = wrapper.findAll('button').find((b) => b.text().trim() === 'Team')
      expect(teamTab).toBeDefined()
      await teamTab!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/team')
    })

    it('switching from email-forwarding to profile updates path to /settings/profile', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding')

      const profileTab = wrapper.findAll('button').find((b) => b.text().trim() === 'Profile')
      expect(profileTab).toBeDefined()
      await profileTab!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/profile')
    })
  })

  // ─── Sub-tab navigation updates the URL query ───────────────────────────────

  describe('sub-tab navigation updates the URL query', () => {
    it('clicking forwarding sub-tab adds ?tab=forwarding to the URL', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding')

      const forwardingBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Forwarding')
      expect(forwardingBtn).toBeDefined()
      await forwardingBtn!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/email-forwarding')
      expect(router.currentRoute.value.query.tab).toBe('forwarding')
    })

    it('clicking domains sub-tab adds ?tab=domains to the URL', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding')

      const domainsBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Domains')
      expect(domainsBtn).toBeDefined()
      await domainsBtn!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/email-forwarding')
      expect(router.currentRoute.value.query.tab).toBe('domains')
    })

    it('clicking email sub-tab removes ?tab= from the URL (default sub-tab)', async () => {
      const { wrapper, router } = await mountAt('/settings/email-forwarding?tab=forwarding')

      const emailBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Email')
      expect(emailBtn).toBeDefined()
      await emailBtn!.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/settings/email-forwarding')
      expect(router.currentRoute.value.query.tab).toBeUndefined()
    })
  })

  // ─── Unknown tab handling ───────────────────────────────────────────────────

  describe('unknown tab handling', () => {
    it('redirects unknown tab segment to /settings/profile', async () => {
      const { router } = await mountAt('/settings/nonexistent')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/settings/profile')
    })
  })
})
