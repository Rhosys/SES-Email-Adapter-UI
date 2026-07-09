import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatarIcon from '@/components/UserAvatarIcon.vue'

describe('UserAvatarIcon', () => {
  it('renders an image when picture is set', () => {
    const wrapper = mount(UserAvatarIcon, {
      props: { picture: 'https://example.com/pic.png', initials: 'JD', displayName: 'Jane Doe' },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/pic.png')
    expect(img.attributes('alt')).toBe('Jane Doe')
    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('renders initials when picture is null', () => {
    const wrapper = mount(UserAvatarIcon, {
      props: { picture: null, initials: 'JD' },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('span').text()).toBe('JD')
  })

  it('applies the given text size class to the initials span', () => {
    const wrapper = mount(UserAvatarIcon, {
      props: { picture: null, initials: '?', textSize: 'text-lg' },
    })
    expect(wrapper.find('span').classes()).toContain('text-lg')
  })
})
