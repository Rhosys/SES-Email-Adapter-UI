import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AddForwardingTargetModal from '@/components/settings/AddForwardingTargetModal.vue'

function mountModal(open = true) {
  const submit = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(AddForwardingTargetModal, { props: { open, submit } })
  return { wrapper, submit }
}

describe('AddForwardingTargetModal', () => {
  it('does not render when closed', () => {
    const { wrapper } = mountModal(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('shows type selector and input in a single panel', () => {
    const { wrapper } = mountModal()
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('Webhook')
    // Input is always visible (single-panel design)
    expect(wrapper.find('input').exists()).toBe(true)
    // Defaults to email type
    expect(wrapper.find('input').attributes('type')).toBe('email')
  })

  it('switches input type when webhook is selected', async () => {
    const { wrapper } = mountModal()
    await wrapper.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    const input = wrapper.find('input')
    expect(input.attributes('type')).toBe('url')
    expect(input.attributes('placeholder')).toContain('hooks.example.com')
  })

  it('clears input when switching types', async () => {
    const { wrapper } = mountModal()
    await wrapper.find('input').setValue('test@example.com')
    await wrapper.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('submits the trimmed target with its type via the submit prop', async () => {
    const { wrapper, submit } = mountModal()
    await wrapper.find('input').setValue('  forward@example.com  ')
    await wrapper.find('form').trigger('submit')
    expect(submit).toHaveBeenCalledWith({ type: 'email', target: 'forward@example.com' })
  })

  it('emits update:open(false) when Cancel is clicked', async () => {
    const { wrapper } = mountModal()
    await wrapper.find('input').setValue('https://hooks.example.com/x')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('emits update:open(false) on Escape', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(AddForwardingTargetModal, {
      props: { open: false, submit },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    // The watch callback focuses the input on open — wait for that side effect
    await vi.waitUntil(() => document.activeElement?.tagName === 'INPUT')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('resets to email type each time it is freshly reopened', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(AddForwardingTargetModal, { props: { open: false, submit } })
    await wrapper.setProps({ open: true })
    // Switch to webhook and enter a value
    await wrapper.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    await wrapper.find('input').setValue('https://test.com/hook')

    // Close and reopen
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    // Should reset to email type with empty input
    expect(wrapper.find('input').attributes('type')).toBe('email')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })
})
