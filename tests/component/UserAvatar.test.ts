import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import UserAvatar from '@/components/UserAvatar.vue'

vi.mock('@/lib/auth', () => ({
  loginClient: {
    getUserIdentity: vi.fn(() => ({
      userId: 'usr_abc123',
      email: 'test@example.com',
      name: 'Ada Lovelace',
      picture: null,
    })),
  },
}))

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/profile', component: { template: '<div />' } },
    ],
  })
}

describe('UserAvatar', () => {
  let router: ReturnType<typeof makeRouter>

  beforeEach(() => {
    router = makeRouter()
  })

  it('renders initials when no picture', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('AL')
  })

  it('compact mode: clicking avatar navigates to /profile', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('sidebar mode: clicking avatar navigates to /profile', async () => {
    const wrapper = mount(UserAvatar, {
      props: { sidebar: true },
      global: { plugins: [router] },
    })
    await wrapper.find('button').trigger('click')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('popup appears on mouseenter and shows email and userId as plain text', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('div').trigger('mouseenter')
    const popup = wrapper.find('[role="dialog"]')
    expect(popup.isVisible()).toBe(true)
    expect(popup.text()).toContain('test@example.com')
    expect(popup.text()).toContain('usr_abc123')
  })

  it('popup shows clipboard icon buttons for email and userId', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.vm.$nextTick() // let onMounted identity propagate to v-if="email"
    expect(wrapper.find('button[title="Copy email"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Copy user ID"]').exists()).toBe(true)
  })

  it('popup closes after mouseleave timeout', async () => {
    vi.useFakeTimers()
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('div').trigger('mouseenter')
    const dialog = wrapper.find('[role="dialog"]')
    expect((dialog.element as HTMLElement).style.display).not.toBe('none')
    await wrapper.find('div').trigger('mouseleave')
    vi.runAllTimers()
    await wrapper.vm.$nextTick()
    expect((dialog.element as HTMLElement).style.display).toBe('none')
    vi.useRealTimers()
  })
})
