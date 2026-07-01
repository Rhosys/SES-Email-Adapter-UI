import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CopyMenuItem from '@/components/CopyMenuItem.vue'
import { useToast } from '@/composables/useToast'

const writeText = vi.fn().mockResolvedValue(undefined)

describe('CopyMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    useToast().toasts.value = []
  })

  it('renders "Copy {label}" with a copy icon', () => {
    const wrapper = mount(CopyMenuItem, { props: { value: 'sig_1', label: 'Signal ID' } })
    expect(wrapper.text()).toBe('Copy Signal ID')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('copies the value, shows a confirmation toast, and emits click', async () => {
    const wrapper = mount(CopyMenuItem, { props: { value: 'sig_1', label: 'Signal ID' } })
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('sig_1')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(useToast().toasts.value.some((t) => t.message === 'Signal ID copied')).toBe(true)
  })

  it('does not show a toast when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mount(CopyMenuItem, { props: { value: 'sig_1', label: 'Signal ID' } })
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(useToast().toasts.value).toHaveLength(0)
  })
})
