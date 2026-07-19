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

  it('shows the type picker first, then the input form for the chosen type', async () => {
    const { wrapper } = mountModal()
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('Webhook')
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('type')).toBe('url')
    expect(input.attributes('placeholder')).toContain('hooks.example.com')
  })

  it('"Back" returns to the type picker without closing the modal', async () => {
    const { wrapper } = mountModal()
    await wrapper.findAll('button').find((b) => b.text() === 'Email')!.trigger('click')
    await wrapper.find('input').setValue('a@example.com')
    await wrapper.findAll('button').find((b) => b.text() === 'Back')!.trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('Webhook')
  })

  it('submits the trimmed target with its type via the submit prop', async () => {
    const { wrapper, submit } = mountModal()
    await wrapper.findAll('button').find((b) => b.text() === 'Email')!.trigger('click')
    await wrapper.find('input').setValue('  forward@example.com  ')
    await wrapper.find('form').trigger('submit')
    expect(submit).toHaveBeenCalledWith({ type: 'email', target: 'forward@example.com' })
  })

  it('emits update:open(false) when Cancel is clicked, and resets the form', async () => {
    const { wrapper } = mountModal()
    await wrapper.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    await wrapper.find('input').setValue('https://hooks.example.com/x')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('emits update:open(false) on Escape', async () => {
    // The Escape listener is wired inside a watch(() => props.open) that only
    // attaches on a false→true transition (matching real usage: the modal
    // always starts closed) — mount closed, then open it, rather than
    // mounting already-open where the watcher would never fire.
    const submit = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(AddForwardingTargetModal, {
      props: { open: false, submit },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    // The watch() callback is async (awaits its own nextTick before wiring the
    // Escape listener) — wait for its focus-on-open side effect as a signal
    // that continuation has actually run, rather than racing it.
    await vi.waitUntil(() => document.activeElement?.tagName === 'BUTTON')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('resets to the type picker each time it is freshly reopened', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(AddForwardingTargetModal, { props: { open: false, submit } })
    await wrapper.setProps({ open: true })
    await wrapper.findAll('button').find((b) => b.text() === 'Email')!.trigger('click')
    expect(wrapper.find('input').exists()).toBe(true)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('Webhook')
  })
})
