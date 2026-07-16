import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import InboxTabBar from '@/components/InboxTabBar.vue'

describe('InboxTabBar', () => {
  it('renders the three tabs in both the desktop strip and the mobile bar', () => {
    const wrapper = mount(InboxTabBar, { props: { activeTab: 'active' } })
    const lists = wrapper.findAll('[role="tablist"]')
    expect(lists).toHaveLength(2)
    expect(lists[0].findAll('button')).toHaveLength(3)
    expect(lists[1].findAll('button')).toHaveLength(3)
  })

  it('emits "change" with "archived" when the Archived tab is clicked', async () => {
    const wrapper = mount(InboxTabBar, { props: { activeTab: 'active' } })
    const desktopButtons = wrapper.findAll('[role="tablist"]')[0].findAll('button')
    await desktopButtons[1].trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual(['archived'])
  })

  it('emits "change" with "all" when the All tab is clicked', async () => {
    const wrapper = mount(InboxTabBar, { props: { activeTab: 'active' } })
    const desktopButtons = wrapper.findAll('[role="tablist"]')[0].findAll('button')
    await desktopButtons[2].trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual(['all'])
  })

  it('marks the active tab with border-ctp-blue in the desktop strip', () => {
    const wrapper = mount(InboxTabBar, { props: { activeTab: 'archived' } })
    const desktopButtons = wrapper.findAll('[role="tablist"]')[0].findAll('button')
    expect(desktopButtons[1].classes()).toContain('border-ctp-blue')
    expect(desktopButtons[0].classes()).not.toContain('border-ctp-blue')
  })

  it('shows the active-count badge on the Inbox tab in the mobile bar', () => {
    const wrapper = mount(InboxTabBar, {
      props: { activeTab: 'active', activeCount: 5, activeCountHasMore: false },
    })
    const mobileBar = wrapper.findAll('[role="tablist"]')[1]
    expect(mobileBar.text()).toContain('5')
  })

  it('formats a has-more count as "N+"', () => {
    const wrapper = mount(InboxTabBar, {
      props: { activeTab: 'active', activeCount: 20, activeCountHasMore: true },
    })
    const mobileBar = wrapper.findAll('[role="tablist"]')[1]
    expect(mobileBar.text()).toContain('20+')
  })

  it('omits the badge when there are no active threads', () => {
    const wrapper = mount(InboxTabBar, {
      props: { activeTab: 'active', activeCount: 0, activeCountHasMore: false },
    })
    const mobileBar = wrapper.findAll('[role="tablist"]')[1]
    // Only the three tab labels, no numeric badge.
    expect(mobileBar.text()).toBe('InboxArchivedAll')
  })
})
