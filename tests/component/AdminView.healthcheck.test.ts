import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err, type Result } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminView from '@/views/AdminView.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
import type { HealthCheckValidation } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      validateHealthCheck: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

const ADMIN_ACCOUNT_ID = 'acc-t8cmlkkck3vtm'

function mockValidation(overrides: Partial<HealthCheckValidation> = {}): HealthCheckValidation {
  return {
    status: 'fail',
    checkedDate: '2026-07-08',
    messageId: 'healthcheck-2026-07-08@platform.email.rhosys.cloud',
    checkedAt: '2026-07-09T00:00:00.000Z',
    checks: [
      { id: 'signal-received', label: 'Healthcheck email received', status: 'pass' },
      { id: 'thread-assigned', label: 'Thread assigned to signal', status: 'pass' },
      { id: 'workflow-classified', label: 'Classified as healthcheck workflow', status: 'pass' },
      { id: 'embedding-indexed', label: 'Embedding indexed for search', status: 'fail', detail: 'No embedding found.' },
    ],
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'admin', component: { template: '<div />' } }],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(AdminView, { global: { plugins: [pinia, router] }, attachTo: document.body })
}

describe('AdminView — health check validation', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: ADMIN_ACCOUNT_ID,
      name: 'Admin',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('runs the validation automatically on mount and shows the in-progress alert while loading', async () => {
    let resolve: (v: Result<HealthCheckValidation, ApiError>) => void = () => {}
    vi.mocked(api.validateHealthCheck).mockReturnValue(new Promise((r) => { resolve = r }))

    const wrapper = await mountView()

    expect(api.validateHealthCheck).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Health check validation in progress')

    resolve(ok(mockValidation()))
    await flushPromises()

    expect(wrapper.text()).not.toContain('Health check validation in progress')
  })

  it('renders each check with its status once validation resolves', async () => {
    vi.mocked(api.validateHealthCheck).mockResolvedValue(ok(mockValidation()))

    const wrapper = await mountView()
    await flushPromises()

    const items = wrapper.findAll('li')
    const healthItems = items.filter((li) => li.text().includes('Healthcheck email received')
      || li.text().includes('Embedding indexed for search'))
    expect(healthItems.length).toBeGreaterThanOrEqual(2)

    expect(wrapper.text()).toContain('One or more checks failing')
    expect(wrapper.text()).toContain('Embedding indexed for search')
    expect(wrapper.text()).toContain('No embedding found.')
  })

  it('re-runs validation when the refresh button is clicked', async () => {
    vi.mocked(api.validateHealthCheck).mockResolvedValue(ok(mockValidation({ status: 'pass' })))

    const wrapper = await mountView()
    await flushPromises()
    expect(api.validateHealthCheck).toHaveBeenCalledTimes(1)

    const refresh = wrapper.findAll('button').find((b) => b.text().includes('Refresh'))!
    await refresh.trigger('click')
    await flushPromises()

    expect(api.validateHealthCheck).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('All checks passing')
  })

  it('shows an error alert when validation fails to run', async () => {
    vi.mocked(api.validateHealthCheck).mockResolvedValue(err(new ApiError(403, 'Forbidden')))

    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Health check validation failed to run')
    expect(wrapper.text()).toContain('Forbidden')
  })
})
