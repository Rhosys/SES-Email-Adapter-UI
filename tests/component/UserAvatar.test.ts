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

  it('compact mode: avatar link points to /profile', () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    const links = wrapper.findAll('a')
    expect(links.some((l) => l.attributes('href') === '/profile')).toBe(true)
  })

  it('sidebar mode: avatar link points to /profile', () => {
    const wrapper = mount(UserAvatar, {
      props: { sidebar: true },
      global: { plugins: [router] },
    })
    const links = wrapper.findAll('a')
    expect(links.some((l) => l.attributes('href') === '/profile')).toBe(true)
  })

  it('popup appears on mouseenter and contains email and userId', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('div').trigger('mouseenter')
    // email appears as text in the header
    expect(wrapper.text()).toContain('test@example.com')
    // userId is inside a CopyInput <input readonly>, not a text node
    const inputs = wrapper.findAll('input[readonly]')
    const values = inputs.map((i) => (i.element as HTMLInputElement).value)
    expect(values).toContain('usr_abc123')
  })

  it('popup shows copyable inputs for email and userId', async () => {
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('div').trigger('mouseenter')
    const inputs = wrapper.findAll('input[readonly]')
    const values = inputs.map((i) => (i.element as HTMLInputElement).value)
    expect(values).toContain('test@example.com')
    expect(values).toContain('usr_abc123')
  })

  it('popup closes after mouseleave timeout', async () => {
    vi.useFakeTimers()
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } })
    await wrapper.find('div').trigger('mouseenter')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.find('div').trigger('mouseleave')
    vi.runAllTimers()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    vi.useRealTimers()
  })
})
