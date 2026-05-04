import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusTabs from '@/components/StatusTabs.vue'

describe('StatusTabs', () => {
  it('renders three tabs', () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'active', total: 10 } })
    expect(wrapper.findAll('button')).toHaveLength(3)
  })

  it('emits "change" with "archived" when Archived tab is clicked', async () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'active', total: 5 } })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual(['archived'])
  })

  it('emits "change" with "all" when All tab is clicked', async () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'active', total: 5 } })
    const buttons = wrapper.findAll('button')
    await buttons[2].trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual(['all'])
  })

  it('marks active tab with border-ctp-blue class', () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'archived', total: 5 } })
    const buttons = wrapper.findAll('button')
    expect(buttons[1].classes()).toContain('border-ctp-blue')
    expect(buttons[0].classes()).not.toContain('border-ctp-blue')
  })

  it('shows total count badge on active tab when total > 0', () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'active', total: 42 } })
    expect(wrapper.text()).toContain('42')
  })

  it('does not show count badge when total is 0', () => {
    const wrapper = mount(StatusTabs, { props: { activeTab: 'active', total: 0 } })
    expect(wrapper.find('span').exists()).toBe(false)
  })
})
