import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UrgencyBadge from '@/components/UrgencyBadge.vue'

describe('UrgencyBadge', () => {
  it('renders nothing for normal urgency', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'normal' } })
    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('renders nothing for low urgency', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'low' } })
    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('renders nothing for silent urgency', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'silent' } })
    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('renders nothing when urgency is undefined', () => {
    const wrapper = mount(UrgencyBadge, { props: {} })
    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('renders red badge for critical', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'critical' } })
    expect(wrapper.find('span').classes()).toContain('bg-ctp-red')
    expect(wrapper.find('span').text()).toBe('!')
  })

  it('renders peach badge for high', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'high' } })
    expect(wrapper.find('span').classes()).toContain('bg-ctp-peach')
    expect(wrapper.find('span').text()).toBe('!')
  })
})
