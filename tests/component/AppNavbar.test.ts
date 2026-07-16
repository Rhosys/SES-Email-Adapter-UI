import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'

vi.mock('@/lib/auth', () => ({
  logout: vi.fn(),
  loginClient: { getUserIdentity: vi.fn(() => null) },
}))

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/settings', name: 'settings', component: stub },
    ],
  })
}

async function mountNavbar(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push('/settings')
  await router.isReady()
  return mount(AppNavbar, { props, global: { plugins: [router] } })
}

describe('AppNavbar — mobile back vs. hamburger', () => {
  it('shows the hamburger and not the back button by default', async () => {
    const wrapper = await mountNavbar({ showHamburger: true })
    expect(wrapper.find('[aria-label="Toggle menu"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Back"]').exists()).toBe(false)
  })

  it('shows the back button instead of the hamburger when mobileBack is true', async () => {
    const wrapper = await mountNavbar({ showHamburger: true, mobileBack: true })
    expect(wrapper.find('[aria-label="Back"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Toggle menu"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Back"]').text()).toContain('Back')
  })

  it('emits "back" when the back button is clicked', async () => {
    const wrapper = await mountNavbar({ showHamburger: true, mobileBack: true })
    await wrapper.find('[aria-label="Back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('emits "toggleSidebar" when the hamburger is clicked', async () => {
    const wrapper = await mountNavbar({ showHamburger: true })
    await wrapper.find('[aria-label="Toggle menu"]').trigger('click')
    expect(wrapper.emitted('toggleSidebar')).toHaveLength(1)
  })
})
